# Role Action Matrix (MVP Baseline)

This matrix is the single source of truth for role expectations in organization and project flows.

## Project Roles

| Action | Owner | Admin | Member | Viewer |
| --- | --- | --- | --- | --- |
| View project and Live View | Yes | Yes | Yes | Yes |
| Run Release Gate | Yes | Yes | Yes | Yes |
| Manage project members | Yes | Yes | No | No |
| Delete project | Yes | No | No | No |
| Manage project API keys | Yes | Yes | No | No |

## Organization Scope

| Action | Owner | Admin | Member | Viewer |
| --- | --- | --- | --- | --- |
| Create organization | Yes | Yes | Yes | Yes |
| View organization settings | Yes | Yes | Yes | Yes |
| Invite/remove org members | Yes | Yes | No | No |
| Update organization settings | Yes | No | No | No |
| Delete organization | Yes | No | No | No |

## Account and Service Keys

| Action | Owner | Admin | Member | Viewer |
| --- | --- | --- | --- | --- |
| Create personal service API key | Yes | Yes | Yes | Yes |
| Rotate personal service API key | Yes | Yes | Yes | Yes |
| Revoke personal service API key | Yes | Yes | Yes | Yes |

## UX Rule

- Forbidden responses should include:
  - required role(s),
  - current role,
  - next action hint: "Ask an owner or admin to update your role."
