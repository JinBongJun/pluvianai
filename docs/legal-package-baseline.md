# Legal Package Baseline (Step 2 Completion)

This defines the lightweight legal package used for MVP/beta trust readiness.

## Template Strategy

- **Template class selected:** startup SaaS "light" Terms + Privacy baseline.
- **Customization policy:** keep plain-language sections, replace all placeholders with
  real product behavior and infrastructure facts from this repository.

## Required Customization Fields

1. **Data categories**
   - account metadata
   - workspace/org/project metadata
   - snapshots/log payloads submitted for observability and replay validation
2. **Retention and deletion**
   - free baseline retention window
   - soft-delete + grace + hard-delete lifecycle
3. **Third-party services**
   - product analytics provider(s)
   - hosting/infrastructure provider(s)
4. **Data location**
   - primary processing/storage region(s) for customer data

## MVP Values (Current)

- **Retention baseline:** 30 days for free plan snapshots/logs.
- **Deletion policy:** soft-delete first, hard-delete after 30-day grace.
- **Analytics:** PostHog.
- **Hosting/runtime:** Railway.
- **Primary data location statement:** US-based infrastructure (adjust if deployment region changes).

## Honesty Rule

- Public trust/security copy must describe the current shipped baseline only.
- Do not imply SOC2, ISO 27001, SSO, MFA enforcement, pentest coverage, or regional residency guarantees unless they are actually in place.
- When a control is partial, say so plainly and link to roadmap/follow-up work instead of using compliance-sounding language.

## Current Limitations To State Explicitly

- MVP/beta operational baseline, not enterprise compliance certification.
- Operational metadata such as user IDs, IP addresses, user agents, and audit records may be retained for abuse prevention and incident review.
- Analytics collection is minimized/redacted for common sensitive fields, but product analytics is still enabled via PostHog.
- US-based deployment is the current default; dedicated data residency options are not yet offered.

## Shipping Surfaces

- Public pages:
  - `/terms`
  - `/privacy`
  - `/security`
- In-product discovery:
  - Organization Settings -> `Legal & Security` card
- Marketing discovery:
  - Landing footer links to Terms / Privacy / Security

## Out of Scope for MVP

- Jurisdiction-specific legal clauses beyond baseline startup templates.
- DPA/SOC2 language beyond currently implemented controls.
