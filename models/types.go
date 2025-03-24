package models

import (
	"sync"
	"time"
)

// Player represents a user in a planning poker session
type Player struct {
	Name      string    `json:"name"`
	Card      Card      `json:"card"`
	IsCreator bool      `json:"isCreator"`
	JoinedAt  time.Time `json:"joinedAt"`
}

// VoteSession represents a completed voting session
type VoteSession struct {
	Players   map[string]*Player `json:"players"`
	Timestamp time.Time          `json:"timestamp"`
	Link      string             `json:"link"`
}

// Room represents a planning poker session
type Room struct {
	ID          string              `json:"id"`
	Players     map[string]*Player  `json:"players"`
	Status      string              `json:"status"`
	CreatedAt   time.Time           `json:"createdAt"`
	VoteHistory []VoteSession       `json:"voteHistory"`
	Link        string              `json:"link"`
	Mutex       sync.RWMutex        `json:"-"`
	Clients     map[chan Event]bool `json:"-"`
}

// Event represents an SSE event to be sent to clients
type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}
