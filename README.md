# Echo Realms

Multiplayer adventure RPG built with Node.js, Socket.IO, and HTML5 Canvas.

## Setup
- `npm install` in /server
- `node server/server.js`
- Open localhost:3000

## Best Practices Implemented
- Authoritative server for anti-cheat.
- Client prediction & reconciliation for low latency.
- Delta state updates for efficiency.
- Persistence with SQLite (scale to PostgreSQL/Redis).
- For prod: Use nginx for reverse proxy/SSL.

## Deployment (Heroku example)
heroku create
git push heroku main

## Assets
Download from opengameart.org and place in client/assets/.
