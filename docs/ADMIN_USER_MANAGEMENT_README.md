# Admin User Management Service

## Overview

The Admin User Management Service provides a comprehensive system for managing
users in the Transxact platform. This includes viewing, searching, filtering,
managing roles/statuses, inviting users, and maintaining audit logs.

## Features

### 1. User Management

- **List Users**: View all users with pagination (20 users per page)
- **Search Users**: Search by name or email
- **Filter Users**: Filter by role (admin/member) and status
  (active/inactive/pending)
- **Export Users**: Export user list as CSV file with customizable filters

### 2. Role Management

- Change user roles between `admin` and `member`
- Admins can manage other users and system settings
- Members have basic access to projects and tasks
- Self-deletion protection (admins cannot change their own role)

### 3. Status Management

- Update user status to `active`, `inactive`, or `pending`
- Activate or deactivate user accounts
- Track status changes in audit logs

### 4. User Invitations

- Invite new users via email
- Assign role during invitation (admin or member)
- Email notifications sent automatically
- Track invitation status

### 5. Audit Logging

- Complete audit trail of all admin actions
- Track changes: who made the change, what changed, and when
- Supports actions: created, invited, role_changed, status_changed, deleted
- Store previous and new values for all changes

## File Structure

```
app/
├── admin/
│   └── users/
│       ├── page.tsx                 # User list and management dashboard
│       ├── [id]/
│       │   └── page.tsx             # User detail page with edit capabilities
│       └── invite/
│           └── page.tsx             # Invite new user form
└── api/
    └── admin/
        └── users/
            ├── route.ts             # GET list users, POST invite user
            ├── [id]/
            │   ├── route.ts         # GET user, PATCH update, DELETE user
            │   └── audit-logs/
            │       └── route.ts     # GET audit logs for user
            └── export/
                └── csv/
                    └── route.ts     # GET export users as CSV

services/
└── user-management.service.ts       # Core business logic

db/
└── schema.ts                        # Database schema including audit_log table
```

## API Endpoints

### User Management Endpoints

#### List Users

```
GET /api/admin/users
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 20, max: 100)
  - search: string (optional - search by name or email)
  - role: 'admin' | 'member' (optional)
  - status: 'active' | 'inactive' | 'pending' (optional)

Response:
{
  "users": [...],
  "total": 100,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

#### Get User Details

```
GET /api/admin/users/:id
Response:
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "role": "admin",
  "status": "active",
  "lastLoginAt": "2025-01-15T10:30:00Z",
  "createdAt": "2024-12-01T09:00:00Z"
}
```

#### Update User Role

```
PATCH /api/admin/users/:id
Body:
{
  "role": "member"
}
Response: Updated user object
```

#### Update User Status

```
PATCH /api/admin/users/:id
Body:
{
  "status": "inactive"
}
Response: Updated user object
```

#### Invite New User

```
POST /api/admin/users
Body:
{
  "email": "newuser@example.com",
  "role": "member"
}
Response: New user object
```

#### Delete User

```
DELETE /api/admin/users/:id
Response: { "message": "User deleted successfully" }
```

#### Get Audit Logs

```
GET /api/admin/users/:id/audit-logs
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 20, max: 100)

Response:
{
  "logs": [
    {
      "id": 1,
      "adminUserId": 1,
      "targetUserId": 2,
      "action": "role_changed",
      "previousValue": "member",
      "newValue": "admin",
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 5
}
```

#### Export Users as CSV

```
GET /api/admin/users/export/csv
Query Parameters:
  - search: string (optional)
  - role: 'admin' | 'member' (optional)
  - status: 'active' | 'inactive' | 'pending' (optional)

Response: CSV file download
Columns: ID, Name, Email, Role, Status, Created At, Last Login
```

## Authentication & Authorization

All endpoints require:

- **Authentication**: Valid JWT token in `Authorization: Bearer <token>` header
- **Authorization**: User must have `admin` role

Endpoints automatically validate:

- Token presence and validity
- Admin role requirement
- Self-modification restrictions

## Database Schema

### audit_log Table

```typescript
export const auditLog = sqliteTable("audit_log", {
  id: int().primaryKey({ autoIncrement: true }),
  adminUserId: int()
    .notNull()
    .references(() => user.id),
  targetUserId: int()
    .notNull()
    .references(() => user.id),
  action: text().notNull().$type<AuditLogAction>(),
  previousValue: text(),
  newValue: text(),
  metadata: text(),
  createdAt: text().notNull(),
});
```

**Action Types:**

- `created` - User account created
- `invited` - User invited to system
- `role_changed` - User role modified
- `status_changed` - User status modified
- `deleted` - User deleted/deactivated

## UI Pages

### 1. Users List (/admin/users)

- Display paginated table of all users
- Search bar for name/email search
- Filter dropdowns for role and status
- Export CSV button
- Edit button linking to user detail page
- Delete button with confirmation

### 2. User Detail (/admin/users/[id])

- Display user information (name, email, created date, last login)
- Edit role with dropdown and save button
- Edit status with dropdown and save button
- Audit log table showing all changes to this user
- Back link to users list

### 3. Invite User (/admin/users/invite)

- Email input field
- Role selection dropdown (admin/member)
- Send invitation button
- List of recently invited users in session
- Help text explaining how invitations work

## Usage Examples

### Using the Service Layer

```typescript
import {
  listUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  inviteUser,
  deleteUser,
  getAuditLogs,
  exportUsersToCSV,
} from "@/services/user-management.service";

// List users with filters
const result = await listUsers({
  page: 1,
  limit: 20,
  search: "john",
  role: "admin",
  status: "active",
});

// Update user role
const updated = await updateUserRole(adminId, userId, "member");

// Invite new user
const newUser = await inviteUser(adminId, "user@example.com", "member");

// Get audit logs
const { logs, total } = await getAuditLogs(userId);
```

### Using the API

```bash
# List users
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/admin/users?page=1&role=admin"

# Update user role
curl -X PATCH \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"member"}' \
  "http://localhost:3000/api/admin/users/5"

# Invite user
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","role":"member"}' \
  "http://localhost:3000/api/admin/users"

# Export users as CSV
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/admin/users/export/csv?role=admin" \
  -o users.csv
```

## Security Considerations

1. **Role-Based Access Control**: All endpoints require admin role
2. **Self-Modification Protection**: Admins cannot:
   - Delete their own account
   - Change their own role
3. **Email Validation**: Email addresses are validated before user creation
4. **Audit Trail**: All modifications are logged with admin user ID
5. **Soft Deletion**: Users are marked inactive rather than hard deleted
6. **Normalized Emails**: All emails are lowercase and trimmed

## Error Handling

The API returns appropriate HTTP status codes:

- `200 OK` - Successful operation
- `201 Created` - User successfully created
- `400 Bad Request` - Invalid input or business rule violation
- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User lacks admin role
- `404 Not Found` - User not found
- `409 Conflict` - User already exists
- `500 Internal Server Error` - Unexpected server error

## Email Notifications

Automated emails are sent for:

1. **User Invitations**: New user receives login instructions
2. **Role Changes**: User notified of role update
3. **Status Changes**: User notified of status change (activated/deactivated)

## Performance Considerations

- Pagination prevents loading large datasets
- Indexed queries on user ID, email, role, and status
- CSV export limited to 10,000 users per request
- Audit logs indexed by target user ID and creation date

## Future Enhancements

- Bulk operations (invite multiple users, update status in bulk)
- Advanced filtering (date ranges, combined filters)
- User activity dashboard
- Permission scoping (department-level admins)
- Two-factor authentication management
- Session management and login history
