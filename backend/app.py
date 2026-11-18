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
    # Public, unauthenticated API: any browser origin may call these endpoints.
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def valid_uuid(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def database_error(error):
    app.logger.exception("Supabase request failed", exc_info=error)
    return jsonify(error="Database request failed", details=getattr(error, "message", str(error))), 500


@app.get("/")
def index():
    return jsonify(service="events-api", endpoints=[
        "GET /api/events",
        "GET /api/events/<id>",
        "POST /api/registrations",
        "GET /api/me/registrations?user_id=<uuid>",
        "GET /api/events/<id>/registrations?user_id=<uuid>",
    ])


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
    user_id = valid_uuid(body.get("user_id"))
    event_id = valid_uuid(body.get("event_id"))
    if not user_id or not event_id:
        return jsonify(error="user_id and event_id must be valid UUIDs"), 400

    try:
        event_result = supabase.table("events").select("id, capacity, status").eq("id", event_id).limit(1).execute()
        if not event_result.data:
            return jsonify(error="Event not found"), 404
        event = event_result.data[0]
        if event.get("status", "").lower() not in ("open", "published", "active"):
            return jsonify(error="Event is not open for registration"), 409

        existing = (supabase.table("registrations").select("id")
                    .eq("event_id", event_id).eq("user_id", user_id).limit(1).execute())
        if existing.data:
            return jsonify(error="User is already registered for this event"), 409

        capacity = event.get("capacity")
        if capacity is not None:
            registrations = supabase.table("registrations").select("id", count="exact").eq("event_id", event_id).execute()
            if (registrations.count or 0) >= capacity:
                return jsonify(error="Event is full"), 409

        created = supabase.table("registrations").insert({"user_id": user_id, "event_id": event_id}).execute()
        return jsonify(created.data[0] if created.data else {}), 201
    except APIError as error:
        # A unique constraint on (user_id, event_id) also protects concurrent duplicate requests.
        message = getattr(error, "message", str(error)).lower()
        if "duplicate" in message or "unique" in message:
            return jsonify(error="User is already registered for this event"), 409
        return database_error(error)


@app.get("/api/me/registrations")
def my_registrations():
    # There is no authentication by request: user_id is supplied by the caller.
    user_id = valid_uuid(request.args.get("user_id"))
    if not user_id:
        return jsonify(error="A valid user_id query parameter is required"), 400
    try:
        response = (supabase.table("registrations").select("*, events(*)")
                    .eq("user_id", user_id).order("created_at", desc=True).execute())
        return jsonify(response.data)
    except APIError as error:
        return database_error(error)


@app.get("/api/events/<event_id>/registrations")
def event_registrations(event_id):
    event_id = valid_uuid(event_id)
    user_id = valid_uuid(request.args.get("user_id"))
    if not event_id or not user_id:
        return jsonify(error="Valid event id and user_id query parameter are required"), 400
    try:
        event_result = supabase.table("events").select("organizer_id").eq("id", event_id).limit(1).execute()
        if not event_result.data:
            return jsonify(error="Event not found"), 404
        # Without authentication, this is only a caller-supplied organizer_id check, not secure access control.
        if event_result.data[0].get("organizer_id") != user_id:
            return jsonify(error="Only the event organizer can view attendees"), 403
        response = (supabase.table("registrations").select("*, users(id, email, role)")
                    .eq("event_id", event_id).order("created_at").execute())
        return jsonify(response.data)
    except APIError as error:
        return database_error(error)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
