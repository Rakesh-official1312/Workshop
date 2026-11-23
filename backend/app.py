import os
from uuid import UUID

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from postgrest import APIError
from supabase import Client, create_client

load_dotenv()

app = Flask(__name__)

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
if not supabase_url or not supabase_key:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY as environment variables")

supabase: Client = create_client(supabase_url, supabase_key)


@app.after_request
def allow_cross_origin_requests(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Accept, Authorization"
    response.headers["Access-Control-Max-Age"] = "600"
    return response


def valid_uuid(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def auth_client():
    return create_client(supabase_url, supabase_key)


def user_profile(client, auth_user):
    """Return the app's users row for a verified Supabase Auth user, creating it when needed."""
    user_id = str(auth_user.id)
    email = auth_user.email
    by_id = client.table("users").select("id, email, role").eq("id", user_id).limit(1).execute()
    if by_id.data:
        return by_id.data[0]

    # Existing EventPulse user rows may predate Supabase Auth account creation.
    by_email = client.table("users").select("id, email, role").ilike("email", email).limit(1).execute()
    if by_email.data:
        return by_email.data[0]

    created = client.table("users").insert({"id": user_id, "email": email, "role": "attendee"}).execute()
    if created.data:
        return created.data[0]
    return {"id": user_id, "email": email, "role": "attendee"}


def current_account():
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None, None, (jsonify(error="Sign in to continue"), 401)
    client = auth_client()
    try:
        auth_response = client.auth.get_user(token)
        auth_user = auth_response.user
        if not auth_user:
            return None, None, (jsonify(error="Session expired. Please sign in again."), 401)
    except Exception as error:
        app.logger.info("Supabase authentication rejected a request: %s", error)
        return None, None, (jsonify(error="Session expired or invalid. Please sign in again."), 401)
    client.postgrest.auth(token)
    try:
        profile = user_profile(client, auth_user)
        return client, profile, None
    except APIError as error:
        return None, None, database_error(error)


def session_response(auth_response, client):
    session = auth_response.session
    auth_user = auth_response.user
    if not session or not auth_user:
        return jsonify(message="Check your email to confirm your account, then sign in.")
    client.postgrest.auth(session.access_token)
    profile = user_profile(client, auth_user)
    return jsonify(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_at=session.expires_at,
        user={"id": str(profile["id"]), "email": profile.get("email") or auth_user.email, "role": profile.get("role", "attendee")},
    )


def database_error(error):
    app.logger.exception("Supabase request failed", exc_info=error)
    message = getattr(error, "message", str(error))
    code = str(getattr(error, "code", "") or "")
    lowered = message.lower()
    if code == "42501" or "row-level security" in lowered or "permission denied" in lowered:
        return jsonify(
            error="Supabase denied this operation. Run the EventPulse auth setup SQL and check the signed-in user's table permissions.",
            details=message,
        ), 403
    if code == "23503" or "foreign key constraint" in lowered:
        return jsonify(
            error="The signed-in email has no matching attendee profile, or the event no longer exists.",
            details=message,
        ), 400
    return jsonify(error="Database request failed", details=message), 500


@app.get("/")
def index():
    return jsonify(service="events-api", endpoints=[
        "POST /api/auth/signup",
        "POST /api/auth/login",
        "POST /api/auth/refresh",
        "GET /api/auth/me",
        "GET /api/events",
        "GET /api/events/<id>",
        "POST /api/registrations",
        "GET /api/me/registrations (requires sign-in)",
        "GET /api/events/<id>/registrations (organizer sign-in required)",
    ])


@app.post("/api/auth/signup")
def sign_up():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if "@" not in email or len(password) < 8:
        return jsonify(error="Enter a valid email and a password with at least 8 characters."), 400
    client = auth_client()
    try:
        result = client.auth.sign_up({"email": email, "password": password})
    except Exception as error:
        app.logger.info("Supabase sign-up failed: %s", error)
        return jsonify(error=getattr(error, "message", "Could not create account. Check the email and try again.")), 400
    if not result.session:
        return session_response(result, client), 202
    try:
        return session_response(result, client), 201
    except APIError as error:
        return database_error(error)


@app.post("/api/auth/login")
def log_in():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if "@" not in email or not password:
        return jsonify(error="Enter your email and password."), 400
    client = auth_client()
    try:
        result = client.auth.sign_in_with_password({"email": email, "password": password})
    except Exception as error:
        app.logger.info("Supabase sign-in failed for %s: %s", email, error)
        return jsonify(error="Email or password is incorrect, or the account needs email confirmation."), 401
    if not result.session:
        return jsonify(error="Sign in was not completed. Confirm your email and try again."), 401
    try:
        return session_response(result, client)
    except APIError as error:
        return database_error(error)


@app.post("/api/auth/refresh")
def refresh_session():
    body = request.get_json(silent=True) or {}
    refresh_token = str(body.get("refresh_token", ""))
    if not refresh_token:
        return jsonify(error="A refresh token is required."), 400
    client = auth_client()
    try:
        result = client.auth.refresh_session(refresh_token)
    except Exception:
        return jsonify(error="Session expired. Please sign in again."), 401
    if not result.session:
        return jsonify(error="Session expired. Please sign in again."), 401
    try:
        return session_response(result, client)
    except APIError as error:
        return database_error(error)


@app.get("/api/auth/me")
def me():
    _, profile, error = current_account()
    if error:
        return error
    return jsonify(user={"id": str(profile["id"]), "email": profile.get("email"), "role": profile.get("role", "attendee")})


@app.get("/api/events")
def list_events():
    try:
        query = supabase.table("events").select("*")
        status = request.args.get("status")
        if status:
            query = query.eq("status", status)
        response = query.execute()
        return jsonify(response.data)
    except APIError as error:
        return database_error(error)


@app.get("/api/events/<event_id>")
def get_event(event_id):
    event_id = valid_uuid(event_id)
    if not event_id:
        return jsonify(error="Invalid event id"), 400
    try:
        response = supabase.table("events").select("*").eq("id", event_id).limit(1).execute()
        if not response.data:
            return jsonify(error="Event not found"), 404
        return jsonify(response.data[0])
    except APIError as error:
        return database_error(error)


@app.post("/api/registrations")
def create_registration():
    body = request.get_json(silent=True) or {}
    client, profile, auth_error = current_account()
    if auth_error:
        return auth_error
    user_id = valid_uuid(profile.get("id"))
    event_id = valid_uuid(body.get("event_id"))
    if not user_id or not event_id:
        return jsonify(error="A valid event ID is required."), 400

    try:
        created = client.rpc("register_for_event", {"p_event_id": event_id}).execute()
        row = created.data[0] if isinstance(created.data, list) and created.data else created.data
        return jsonify(row or {}), 201
    except APIError as error:
        message = getattr(error, "message", str(error)).lower()
        code = str(getattr(error, "code", "") or "")
        if code == "23505" or "duplicate" in message or "unique" in message:
            return jsonify(error="User is already registered for this event"), 409
        if "already registered" in message:
            return jsonify(error="You are already registered for this event."), 409
        if "event is full" in message:
            return jsonify(error="Event is full"), 409
        if "not open for registration" in message:
            return jsonify(error="Event is not open for registration"), 409
        if "event not found" in message:
            return jsonify(error="Event not found"), 404
        return database_error(error)


@app.get("/api/me/registrations")
def my_registrations():
    client, profile, auth_error = current_account()
    if auth_error:
        return auth_error
    user_id = valid_uuid(profile.get("id"))
    if not user_id:
        return jsonify(error="The signed-in account has no valid user profile."), 400
    try:
        response = (client.table("registrations").select("*, events(*)")
                    .eq("user_id", user_id).order("created_at", desc=True).execute())
        return jsonify(response.data)
    except APIError as error:
        return database_error(error)


@app.get("/api/events/<event_id>/registrations")
def event_registrations(event_id):
    event_id = valid_uuid(event_id)
    client, profile, auth_error = current_account()
    if auth_error:
        return auth_error
    user_id = valid_uuid(profile.get("id"))
    if not event_id or not user_id:
        return jsonify(error="A valid event ID and signed-in account are required."), 400
    try:
        event_result = client.table("events").select("organizer_id").eq("id", event_id).limit(1).execute()
        if not event_result.data:
            return jsonify(error="Event not found"), 404
        if event_result.data[0].get("organizer_id") != user_id:
            return jsonify(error="Only the event organizer can view attendees"), 403
        response = (client.table("registrations").select("*, users(id, email, role)")
                    .eq("event_id", event_id).order("created_at").execute())
        return jsonify(response.data)
    except APIError as error:
        return database_error(error)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
