# API Documentation

Project scope:
- PMS backend built with Node.js + Express + MSSQL
- Channex integration for properties, room types, rate plans, availability, and rate-plan daily sync
- Booking-style reservation handling exists locally, but webhook-driven booking ingestion is not fully implemented yet

Flow model:

```text
Request -> authenticate -> service validation
  -> if synced entity: Channex first
  -> local DB second
  -> sync_logs update
  -> sanitized response
```

Main rule:
- Channex first -> local DB second

## 1. Authentication

| Item | Details |
|---|---|
| Login endpoint | `POST /users/login` |
| JWT | Returned on login, used as `Authorization: Bearer <token>` |
| Middleware | `authenticate` verifies JWT and loads the current user from MSSQL |
| Roles | `superadmin`, `admin`, `customer` |
| Partner fields | `is_from_partner`, `partner_vat`, `partner_name` |
| Active/subscription checks | Implemented in `src/utils/userStatus.js` |

Auth flow:

```text
Authorization: Bearer <token>
  -> JWT verify
  -> user loaded from DB
  -> req.user set
```

Active user rule:

```text
active_until expired + is_active = 1
  -> user becomes inactive
  -> protected actions fail for inactive users
```

## 2. Users API

Base path: `/users`

| Method | Path | Auth | Roles | Description |
|---|---|---:|---|---|
| `POST` | `/register` | No | Public | Register a customer user |
| `POST` | `/login` | No | Public | Login and receive JWT |
| `GET` | `/` | Yes | admin, superadmin | List users |
| `GET` | `/:id` | Yes | admin, superadmin, customer(self) | Get user by ID |
| `GET` | `/me` | Yes | Any authenticated role | Get current user |
| `PUT` | `/:id` | Yes | Role-based | Update user |
| `DELETE` | `/:id` | Yes | superadmin | Delete user |

### Register

Request body:

```json
{
  "vat_number": "123456789",
  "email": "user@example.com",
  "password": "Secret123!",
  "name": "John Doe",
  "is_from_partner": 0,
  "partner_vat": null,
  "partner_name": null
}
```

Rules:
- `name`, `vat_number`, `email`, `password` required
- VAT is normalized to digits only and must be 9 digits
- email must be valid
- password must contain upper/lowercase, number, and special character
- duplicate VAT/email rejected
- new users are saved as `customer`

Side effects:
- DB insert into `users`
- password hashed with bcrypt

### Login

Request body:

```json
{
  "vat_number": "123456789",
  "password": "Secret123!"
}
```

Success response shape:

```json
{
  "success": true,
  "message": "Login Successfull",
  "data": {
    "token": "jwt...",
    "user": {
      "id": "...",
      "vat_number": "...",
      "email": "...",
      "role": "customer",
      "name": "..."
    }
  }
}
```

Important notes:
- user is found by VAT
- password checked with bcrypt
- inactive users are blocked
- token payload contains `userId` and `role`

### User filters/search

Supported query params:
- `vat_number`
- `name`
- `role`
- `is_from_partner`
- `partner_vat`
- `partner_name`
- `city`
- `email`
- `search`
- `postal_code`
- `min_rooms`
- `max_rooms`
- `without_properties`
- `created_after`
- `created_before`
- `page`
- `pageSize`

Role restriction:
- customers cannot list users
- `GET /users/:id` and `GET /users/me` only expose customer rows
- admin/superadmin rows are excluded from user read queries

## 3. Properties API

Base path: `/properties`

| Method | Path | Auth | Roles | Description |
|---|---|---:|---|---|
| `POST` | `/` | Yes | admin, superadmin, customer | Create property |
| `GET` | `/` | Yes | admin, superadmin, customer | List properties |
| `GET` | `/:id` | Yes | admin, superadmin, customer(self) | Get property by ID |
| `PUT` | `/:id` | Yes | admin, superadmin, customer(self) | Update property |
| `DELETE` | `/:id` | Yes | admin, superadmin, customer(self) | Delete property |

### Create property

Request body:

```json
{
  "vat_number": "123456789",
  "name": "Ocean View Hotel",
  "email": "info@example.com",
  "phone": "+30...",
  "city": "Athens",
  "postal_code": "10558",
  "address": "Example street 1",
  "property_type_code": "hotel",
  "max_allowed_rooms": 20
}
```

Rules:
- `name` required
- email required and validated
- admin/superadmin may target a customer by `vat_number`
- customer does not supply `vat_number` for ownership lookup
- Channex create happens first
- local DB save happens second

Side effects:
- `sync_logs` row created
- Channex `POST /properties`
- local insert into `properties`
- `channex_property_id` saved
- `sync_status = SYNCED`

### Get properties

Supported filters:
- `id`
- `property_name`
- `property_email`
- `property_phone`
- `city`
- `postal_code`
- `min_rooms`
- `max_rooms`
- `vat_number`
- `user_name`
- `is_from_partner`
- `partner_vat`
- `partner_name`
- `sync_status`
- `property_type_code`
- `search`
- `created_after`
- `created_before`
- `page`
- `pageSize`
- `include_external`

Behavior:
- customers see only their own properties
- admin/superadmin see all customer properties
- `include_external=true` is for admin/superadmin / shows channex info
- customers get sanitized responses without Channex IDs

Needs verification:
- list endpoint attaches external data only after the result set is sanitized, so check runtime output for `include_external=true`

### Get property by ID

Success response shape:

```json
{
  "success": true,
  "message": "Property fetched successfully",
  "data": {
    "property": { }
  }
}
```

Notes:
- admin/superadmin can request external Channex data with `include_external=true`
- customers receive only local sanitized data

### Update property

Request body can include:
- `name`
- `email`
- `phone`
- `city`
- `postal_code`
- `address`
- `property_type_code`
- `max_allowed_rooms`

Rules:
- customer can update only their own property
- property is updated in Channex first, then locally
- sync log is created before Channex update
- local save failure becomes `failed_local_save`

### Delete property

Behavior:
- local delete only
- admin/superadmin can delete customer properties
- customer can only delete own property if allowed by access check


## 4. Room Types API

Base path:

```text
/properties/:property_id/room-types
```

| Method | Path | Auth | Roles | Description |
|---|---|---:|---|---|
| `POST` | `/` | Yes | admin, superadmin, customer | Create room type |
| `GET` | `/` | Yes | admin, superadmin, customer | List room types |
| `GET` | `/:room_type_id` | Yes | admin, superadmin, customer(self) | Get room type by ID |
| `PUT` | `/:room_type_id` | Yes | admin, superadmin, customer(self) | Update room type |
| `PUT` | `/:room_type_id/activate` | Yes | admin, superadmin, customer(self) | Activate room type |
| `PUT` | `/:room_type_id/deactivate` | Yes | admin, superadmin, customer(self) | Deactivate room type |

### Create room type

Request body:

```json
{
  "name": "Standard Double",
  "room_count": 5,
  "adults": 2,
  "children": 1,
  "infants": 0,
  "default_occupancy": 2
}
```

Rules:
- `name`, `room_count`, `adults`, `default_occupancy` required
- values cannot be negative
- `default_occupancy` cannot exceed total capacity
- property room total cannot exceed `max_allowed_rooms`

Side effects:
- Channex room type create
- local insert into `room_types`
- `channex_room_type_id` saved
- `sync_logs` row created and updated

### Get room types

Supported filters:
- `id`
- `room_type_name`
- `is_active`
- `min_rooms`
- `max_rooms`
- `sync_status`
- `adults`
- `children`
- `infants`
- `include_external`
- `page`
- `pageSize`

Behavior:
- customers see only their room types for the property
- admin/superadmin can search by local ID or Channex ID
- `include_external=true` is for admin/superadmin

### Update room type

Rules:
- room type must exist
- customer must own it
- room type must be active
- if `room_count` changes, the property limit is re-checked
- Channex update happens first
- local save happens second

### Activate / deactivate

Behavior:
- local DB update only
- no Channex call in the current code

## 5. Rate Plans API

Base path:

```text
/properties/:property_id/room-types/:room_type_id/rate-plans
```

Also implemented:
- `/rate-plans`
- `/rate-plans/:rate_plan_id`
- `/rate-plans/:rate_plan_id/daily`

| Method | Path | Auth | Roles | Description |
|---|---|---:|---|---|
| `POST` | `/` | Yes | admin, superadmin, customer | Create rate plan |
| `GET` | `/` | Yes | admin, superadmin, customer | List rate plans |
| `GET` | `/:rate_plan_id` | Yes | admin, superadmin, customer(self) | Get rate plan by ID |
| `PUT` | `/:rate_plan_id` | Yes | admin, superadmin, customer(self) | Update rate plan |
| `PUT` | `/:rate_plan_id/activate` | Yes | admin, superadmin, customer(self) | Activate rate plan |
| `PUT` | `/:rate_plan_id/deactivate` | Yes | admin, superadmin, customer(self) | Deactivate rate plan |
| `GET` | `/rate-plans` | Yes | admin, superadmin, customer | Direct list by rate plan ID scope |
| `GET` | `/rate-plans/:rate_plan_id` | Yes | admin, superadmin, customer(self) | Direct get |
| `PUT` | `/rate-plans/:rate_plan_id` | Yes | admin, superadmin, customer(self) | Direct update |
| `GET` | `/rate-plans/:rate_plan_id/daily` | Yes | admin, superadmin, customer(self) | Direct daily view |
| `PUT` | `/rate-plans/:rate_plan_id/daily` | Yes | admin, superadmin, customer(self) | Direct daily update |

### Create rate plan

Request body example:

```json
{
  "title": "Best Available Rate",
  "meal_type_code": "RO",
  "currency": "EUR",
  "sell_mode": "per_room",
  "rate_mode": "manual",
  "children_fee": 0,
  "infant_fee": 0,
  "options": [
    { "occupancy": 1, "is_primary": true, "rate": 100 },
    { "occupancy": 2, "is_primary": false, "rate": 120 }
  ]
}
```

Rules:
- `title` required
- `options` required and non-empty
- exactly one `is_primary=true`
- `sell_mode` must be `per_room` or `per_person`
- `rate_mode` is only accepted as `manual` in current code
- option occupancy must fit room capacity
- option rate must be `>= 0`
- `meal_type_code` is validated against `meal_types`

Sell mode note:
- code allows both `per_room` and `per_person`
- per-room vs per-person option-count business rule is not strictly enforced in code `Needs verification`

Side effects:
- Channex create first
- local `rate_plans` insert
- local `rate_plan_options` insert
- `channex_rate_plan_id` saved
- sync log created and marked success

### Get / update rate plans

Supported filters:
- `id`
- `property_id`
- `room_type_id`
- `title`
- `search`
- `is_active`
- `currency`
- `sell_mode`
- `rate_mode`
- `meal_type_code`
- `include_external`
- `page`
- `pageSize`

Behavior:
- customers can only see their own rate plans
- admin/superadmin can see all customer rate plans
- `include_external=true` is for admin/superadmin
- customers do not receive Channex IDs

Update rules:
- must already be synced with Channex
- Channex update first, then local update
- options can be replaced
- existing options are deleted and reinserted when `options` is present

Direct rate plan note:
- haven't implemented channex sync to these endpoints yet
- direct `/rate-plans` routes are implemented in Postman and code
- runtime behavior should be checked if you depend on them heavily `Needs verification`

## 6. Availability / ARI API

### Room type availability

Routes:
- `POST /properties/:property_id/room-types/:room_type_id/initialize-availability`
- `PUT /properties/:property_id/room-types/:room_type_id/update-availability`
- `GET /properties/:property_id/availability-calendar`
- `GET /properties/:property_id/room-types/:room_type_id/calendar`
- `GET /availability/diagnostics`

Initialize availability:

```json
{
  "date_from": "2026-06-17",
  "date_to": "2026-06-30"
}
```

Behavior:
- initializes availability to room count
- requires `date_from` and `date_to`

Update availability:

```json
{
  "date_from": "2026-06-17",
  "date_to": "2026-06-20",
  "availability": 3
}
```

Rules:
- can also accept a single `date`
- `availability` required
- cannot be negative
- cannot exceed room count
- date range cannot exceed 730 days

Side effects:
- Channex availability update first
- local `room_type_availability` insert/update second
- manual override is set on updates
- `sync_logs` updated

### Rate plan daily

Routes:
- `PUT /properties/:property_id/room-types/:room_type_id/rate-plans/:rate_plan_id/daily`
- `GET /properties/:property_id/room-types/:room_type_id/rate-plans/:rate_plan_id/daily`
- `PUT /rate-plans/:rate_plan_id/daily`
- `GET /rate-plans/:rate_plan_id/daily`

Request body example:

```json
{
  "date_from": "2026-06-17",
  "date_to": "2026-06-19",
  "min_stay_arrival": 2,
  "min_stay_through": 3,
  "max_stay": 7,
  "closed_to_arrival": false,
  "closed_to_departure": false,
  "stop_sell": false,
  "options": [
    { "occupancy": 1, "rate": 90 },
    { "occupancy": 2, "rate": 110 }
  ]
}
```

Tables used:
- `rate_plan_daily`
- `rate_plan_daily_options`

Rules:
- date or date_from/date_to required
- range cannot exceed 730 days
- at least one restriction or options array required
- occupancies in options must exist in the default rate plan

Side effects:
- Channex restrictions sync first
- local daily rows second
- local daily option rows second
- recovery supported if local save fails

## 7. Reservations API

Base path: `/reservations`

| Method | Path | Auth | Roles | Description |
|---|---|---:|---|---|
| `POST` | `/create` | Yes | all authenticated | Create manual reservation |
| `GET` | `/` | Yes | all authenticated | List reservations |
| `GET` | `/calendar` | Yes | all authenticated | Calendar view |
| `GET` | `/statistics` | Yes | all authenticated | Reservation stats |
| `GET` | `/:reservation_id` | Yes | all authenticated | Get reservation by ID |
| `PUT` | `/:reservation_id` | Yes | all authenticated | Update reservation |
| `PUT` | `/:reservation_id/cancel` | Yes | all authenticated | Cancel reservation |
| `PUT` | `/:reservation_id/check-in` | Yes | all authenticated | Check in |
| `PUT` | `/:reservation_id/check-out` | Yes | all authenticated | Check out |

### Create manual reservation

Request body example:

```json
{
  "property_id": "...",
  "guest_type": 1,
  "guest_name": "John Doe",
  "check_in": "2026-06-17",
  "check_out": "2026-06-20",
  "total_price": 300,
  "notes": "VIP",
  "rooms": [
    {
      "room_type_id": "...",
      "rate_plan_id": "...",
      "rooms_count": 1,
      "adults": 2,
      "children": 0,
      "infants": 0,
      "price": 300
    }
  ]
}
```

Rules:
- `property_id`, `check_in`, `check_out` required
- at least one room required
- `guest_type` must be `1` or `2` 1=individual,2=company
- `guest_name` required for guest type `1`
- company guest requires `guest_company_name` and `guest_vat_number`
- room capacity checked against room type capacity
- availability must exist for the whole stay

Side effects:
- local insert into `reservations`
- local insert into `reservation_rooms`
- local availability decrement
- source saved as `MANUAL`

Guest linking behavior:
- guest data is stored directly on the reservation record

### Reservation calendar and statistics

Behavior:
- calendar uses reservation + reservation_rooms joins
- statistics use reservation counts, revenue, nights, and room breakdowns
- filters include property, room type, rate plan, date ranges, status, guest fields, source, and guest_type

### Channex / Booking.com reservation flow

Current state:
- webhook endpoint stores raw payload only
- no implemented chain exists yet for `Channex webhook -> save log -> GET booking -> process booking -> create reservation`
- needs verification before treating as implemented

### Availability increment/decrement

Behavior:
- reservation create decrements room_type_availability
- cancel increments room_type_availability back
- check-in / check-out update reservation status only


## 8. Webhooks API

Base path: `/webhooks`

| Method | Path | Auth | Roles | Description |
|---|---|---:|---|---|
| `POST` | `/channex` | No | Public + API key | Receive Channex webhook |

Security:
- header `apiKey` must match `CHANNEX_WEBHOOK_API_KEY`
- if header is wrong, endpoint returns `401`

Raw logging:
- webhook payload is saved as-is to `channex_webhook_logs`
- stored fields: event type, entity type, Channex ID, payload JSON

Current behavior:

```text
Channex webhook
  -> validate apiKey
  -> save raw payload
  -> return 200
```

Booking webhook flow:
- not fully implemented
- no actual booking fetch/process/create chain exists in code
- Needs verification

## 9. Sync Logs / Recovery API

Base path: `/sync`

| Method | Path | Auth | Roles | Description |
|---|---|---:|---|---|
| `GET` | `/logs` | Yes | admin, superadmin | List sync logs |
| `POST` | `/recover/:sync_log_id` | Yes | admin, superadmin | Recover failed local save |

Sync log statuses implemented:
- `pending`
- `success`
- `failed`
- `failed_channex`
- `failed_local_save`
- `recovered`

Supported recovery entity types:
- `property`
- `room_type`
- `rate_plan`
- `room_type_availability`
- `rate_plan_daily`

Recovery flow:

```text
failed_local_save
  -> admin/superadmin opens log
  -> POST /sync/recover/:sync_log_id
  -> local row recreated from saved payload
  -> sync log marked recovered
```

## 10. Admin / Debug Features

| Feature | Status |
|---|---|
| `include_external=true` | Implemented for admin/superadmin read flows |
| Search by local ID or Channex ID | Implemented in filters |
| Sanitized customer responses | Implemented |
| Superadmin/admin log access | Implemented |

Sanitization:
- customers do not receive Channex IDs
- customers do not receive external payloads


## 11. Constants / Lookup Tables

Implemented / used in code:

| Table / constant | Use |
|---|---|
| `sync_statuses` | Joined in property, room type, and rate plan read queries |
| `reservation_sources` | Reservation source lookup in reservation reads |
| `meal_types` | Rate plan meal type validation and display |
| `property_types` | Property type display and read queries |
| `reservation_status` values | `1` confirmed, `2` checked-in, `3` checked-out, `4` cancelled |
| `reservation_sources` values | `1` manual, `2` Channex |

Needs verification:
- `reservation_statuses` and `guest_types` are used as business values, but no separate API module is implemented for them

## 12. Success / Error Shape

Success response:

```json
{
  "success": true,
  "message": "OK",
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": 900,
    "message": "Internal server error",
    "details": null
  }
}
```

## Current implemented features summary

- auth + JWT login
- role-based access
- user registration and management
- property CRUD with Channex sync
- room type CRUD with Channex sync
- rate plan CRUD with Channex sync
- availability and rate-plan daily ARI
- manual reservation CRUD
- webhook raw logging
- sync logs and recovery