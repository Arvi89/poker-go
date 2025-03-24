package models

import (
	"time"

	"github.com/google/uuid"
)

// NewRoom creates a new planning poker room
func NewRoom(creatorName string) *Room {
	roomID := uuid.New().String()

	room := &Room{
		ID:          roomID,
		Players:     make(map[string]*Player),
		Status:      StatusVoting,
		CreatedAt:   time.Now(),
		VoteHistory: make([]VoteSession, 0),
		Link:        "",
		Clients:     make(map[chan Event]bool),
	}

	// Add the creator
	creatorPlayer := &Player{
		Name:      creatorName,
		Card:      Unknown,
		IsCreator: true,
		JoinedAt:  time.Now(),
	}

	room.Players[creatorName] = creatorPlayer

	return room
}

// AddPlayer adds a new player to the room
func (r *Room) AddPlayer(name string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	// Check if player name already exists
	if _, exists := r.Players[name]; exists {
		return false
	}

	// Create new player
	player := &Player{
		Name:      name,
		Card:      Unknown,
		IsCreator: false,
		JoinedAt:  time.Now(),
	}

	r.Players[name] = player

	// Broadcast player joined event
	r.broadcastEvent(Event{
		Type:    EventTypePlayerJoined,
		Payload: player,
	})

	return true
}

// RemovePlayer removes a player from the room
func (r *Room) RemovePlayer(name string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	if _, exists := r.Players[name]; !exists {
		return false
	}

	delete(r.Players, name)

	// Broadcast player left event
	r.broadcastEvent(Event{
		Type:    EventTypePlayerLeft,
		Payload: map[string]string{"name": name},
	})

	return true
}

// SubmitVote submits a vote for a player
func (r *Room) SubmitVote(playerName string, card Card) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[playerName]
	if !exists {
		return false
	}

	player.Card = card

	// Broadcast vote submitted event (but not the actual vote)
	r.broadcastEvent(Event{
		Type: EventTypeVoteSubmitted,
		Payload: map[string]string{
			"name": playerName,
		},
	})

	return true
}

// RevealCards reveals all players' cards
func (r *Room) RevealCards(initiatorName string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[initiatorName]
	if !exists || !player.IsCreator {
		return false
	}

	r.Status = StatusRevealed

	// Broadcast reveal event
	r.broadcastEvent(Event{
		Type:    EventTypeCardsRevealed,
		Payload: r,
	})

	return true
}

// ResetVoting resets the voting session
func (r *Room) ResetVoting(initiatorName string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[initiatorName]
	if !exists || !player.IsCreator {
		return false
	}

	// If currently revealed, save the current state to history before resetting
	if r.Status == StatusRevealed {
		// Create a deep copy of the current players state
		playersCopy := make(map[string]*Player)
		for name, player := range r.Players {
			playerCopy := *player // Create a copy of the player
			playersCopy[name] = &playerCopy
		}

		// Add to history
		voteSession := VoteSession{
			Players:   playersCopy,
			Timestamp: time.Now(),
			Link:      r.Link,
		}
		r.VoteHistory = append(r.VoteHistory, voteSession)
	}

	// Reset room state
	r.Status = StatusVoting

	// Reset link
	oldLink := r.Link
	r.Link = ""

	// Reset all cards
	for _, player := range r.Players {
		player.Card = Unknown
	}

	// Broadcast reset event
	r.broadcastEvent(Event{
		Type:    EventTypeVotingReset,
		Payload: r,
	})

	// Also broadcast link update to ensure all clients clear their link displays
	if oldLink != "" {
		r.broadcastEvent(Event{
			Type:    EventTypeLinkUpdated,
			Payload: map[string]string{"link": ""},
		})
	}

	return true
}

// UpdateLink updates the room's link
func (r *Room) UpdateLink(initiatorName string, link string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[initiatorName]
	if !exists || !player.IsCreator {
		return false
	}

	// Update the link (including empty string to clear it)
	r.Link = link

	// Broadcast link updated event
	r.broadcastEvent(Event{
		Type:    EventTypeLinkUpdated,
		Payload: map[string]string{"link": link},
	})

	return true
}

// Subscribe registers a new client to receive events
func (r *Room) Subscribe() chan Event {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	eventChan := make(chan Event, 10)
	r.Clients[eventChan] = true

	return eventChan
}

// Unsubscribe removes a client from receiving events
func (r *Room) Unsubscribe(eventChan chan Event) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	if _, exists := r.Clients[eventChan]; exists {
		delete(r.Clients, eventChan)
		close(eventChan)
	}
}

// broadcastEvent sends an event to all subscribed clients
func (r *Room) broadcastEvent(event Event) {
	for client := range r.Clients {
		select {
		case client <- event:
			// Event sent successfully
		default:
			// Client might be blocked, but we don't want to block here
			// We could implement a cleanup mechanism for stale clients
		}
	}
}
