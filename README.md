# Poker Planning App

This project has been entirely written by Cursor with Claude 3.7 to see what it could do.

A real-time planning poker application for agile teams, built with Go and vanilla JavaScript.

## Overview

This application provides a simple, efficient way for agile teams to estimate work items using the planning poker technique. Team members can join a room, submit votes on cards, and reveal results simultaneously, all in real-time.

## Features

- **Simple Interface**: Clean UI for easy planning poker sessions
- **Real-time Updates**: WebSockets for instant communication
- **No Registration**: Quick setup with temporary rooms
- **Room Management**: Create and join rooms with unique IDs
- **Planning Poker**: Standard card deck with values (0, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?, ☕)
- **Vote Tracking**: Keep track of who has voted without revealing values
- **Results Visualization**: View vote distribution and statistics
- **Vote History**: Track previous voting sessions
- **Session Links**: Add links to stories/tickets being estimated
- **Mobile Responsive**: Works on all device sizes

## Installation

### Prerequisites

- Go 1.16 or higher
- Git

### Steps

1. Clone the repository
   ```
   git clone https://github.com/your-username/poker.git
   cd poker
   ```

2. Install dependencies
   ```
   go mod download
   ```

3. Build the application
   ```
   go build -o poker-app ./cmd/server
   ```

4. Run the application
   ```
   ./poker-app
   ```

5. Open your browser and navigate to `http://localhost:8080`

## Usage

### Creating a Room

1. Enter your name in the "Create a New Room" form
2. Click "Create Room"
3. Share the room ID with your team members

### Joining a Room

1. Enter the room ID in the "Join Existing Room" form
2. Enter your name
3. Click "Join Room"

### Using Planning Poker

1. As a room creator:
   - Select a card to vote
   - Click "Reveal Cards" to show all votes
   - Click "Reset Voting" to start a new round
   - Add a link to the current story/ticket (optional)

2. As a participant:
   - Select a card to vote
   - Wait for the creator to reveal cards
   - View the results and statistics

## Project Structure

```
├── cmd/
│   └── server/           # Application entry point
├── db/
│   └── store.go          # In-memory data store
├── handlers/
│   └── room.go           # HTTP request handlers
├── models/
│   ├── constants.go      # Constants and enums
│   ├── errors.go         # Custom error definitions
│   ├── room.go           # Room business logic
│   └── types.go          # Type definitions
├── static/
│   ├── css/              # Stylesheets
│   ├── js/               # Client-side JavaScript
│   └── favicon.ico       # Application icon
├── templates/
│   └── index.html        # Main HTML template
├── go.mod                # Go module definition
├── go.sum                # Go module checksums
└── README.md             # This file
```

## Architecture

The application follows a clean architecture pattern:

- **Models**: Core business logic and data structures
- **Handlers**: HTTP request handlers for the API
- **DB**: Data storage layer (currently in-memory)
- **Frontend**: Vanilla JavaScript with Server-Sent Events for real-time updates

### Backend

- **Go**: Fast, efficient server-side language
- **Gin**: Lightweight web framework
- **Server-Sent Events**: For real-time communication

### Frontend

- **Vanilla JavaScript**: No frameworks needed
- **CSS**: Custom styling with responsive design
- **LocalStorage**: For persisting user preferences

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 