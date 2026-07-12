# Twinly Content connection

Twinly.life AI persona chats can retrieve contextual reference material from
the separate Twinly Content service. Requests are made only from the server;
the shared agent key is never sent to the browser.

## Configuration

Set the same randomly generated value in both deployments:

```dotenv
# twinly-content
AGENT_API_KEY=<shared-random-secret>

# twinly-ai-magic
TWINLY_CONTENT_API_URL=https://<twinly-content-host>
TWINLY_CONTENT_AGENT_API_KEY=<shared-random-secret>
```

For local development, use `http://localhost:8081` as the content URL.

## Runtime behavior

On each AI chat turn, Twinly.life retrieves cached templates, frameworks,
themes, and creator resources. It ranks them against the fan's current message
and adds at most six matching references to the model's system context.

The persona's platform-enforced explicitness ceiling selects the library
edition:

- `sfw` uses `nice`
- `suggestive` uses `naughty`
- `explicit` uses `wicked` and sends the required adults-only scope headers

Retrieved text is explicitly marked as untrusted reference data. It cannot
override the persona prompt, creator boundaries, moderation, or explicitness
ceiling. If Twinly Content is unavailable, chat continues without library
context.
