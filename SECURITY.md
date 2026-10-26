# Security policy

## Supported versions

Only the latest release of the Foncia integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-foncia](https://github.com/prohand/gladys-foncia/security), then
**Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove e-mails, passwords, tokens and addresses
  first).

You should get a first answer within 7 days. A fix is released as a new version
of the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes —
in particular how the MyFoncia password and the Okta tokens are handled.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)),
and Foncia's own services (my-foncia.fonciamillenium.net, its Okta sign-in, its API): report those
to Foncia.

## What the integration does with your credentials

- The MyFoncia password is stored by Gladys in a `secret` field and only sent
  to Foncia's sign-in service (`login.my-foncia.fonciamillenium.net`), over HTTPS.
- The access and refresh tokens stay in memory, never on disk.
- Neither the password nor the tokens are ever written to the logs.
- The only file the integration writes is `/data/foncia-state.json`: ids of the
  documents, incidents and meetings already seen. No amount, no personal data.

## Good practices for users

- Use a MyFoncia password you use nowhere else.
- Keep Gladys and the integration up to date.
