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

	// Add the creator with a unique ID
	creatorID := uuid.New().String()
	creatorPlayer := &Player{
		ID:        creatorID,
		Name:      creatorName,
		Card:      Unknown,
		IsCreator: true,
		JoinedAt:  time.Now(),
	}

	room.Players[creatorID] = creatorPlayer

	return room
}

// AddPlayer adds a new player to the room
func (r *Room) AddPlayer(name string) (string, bool) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	// Check if player name already exists
	for _, player := range r.Players {
		if player.Name == name {
			return "", false
		}
	}

	// Generate a unique ID for the player
	playerID := uuid.New().String()

	// Create new player
	player := &Player{
		ID:        playerID,
		Name:      name,
		Card:      Unknown,
		IsCreator: false,
		JoinedAt:  time.Now(),
	}

	r.Players[playerID] = player

	// Broadcast player joined event
	r.broadcastEvent(Event{
		Type:    EventTypePlayerJoined,
		Payload: player,
	})

	return playerID, true
}

// RemovePlayer removes a player from the room
func (r *Room) RemovePlayer(playerID string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[playerID]
	if !exists {
		return false
	}

	// Get the player name for the event payload before deleting
	playerName := player.Name
	wasCreator := player.IsCreator

	delete(r.Players, playerID)

	// If the player was a creator and there are other players, transfer creator rights
	if wasCreator && len(r.Players) > 0 {
		// Find another player to transfer creator rights to
		var newCreator *Player

		// Pick the first available player
		for _, p := range r.Players {
			newCreator = p
			break
		}

		// Set the new player as creator
		if newCreator != nil {
			newCreator.IsCreator = true

			// Broadcast creator changed event
			r.broadcastEvent(Event{
				Type: EventTypeCreatorChanged,
				Payload: map[string]string{
					"newCreator": newCreator.Name,
				},
			})
		}
	}

	// Broadcast player left event
	r.broadcastEvent(Event{
		Type:    EventTypePlayerLeft,
		Payload: map[string]string{"name": playerName},
	})

	return true
}

// SubmitVote submits a vote for a player
func (r *Room) SubmitVote(playerID string, card Card) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[playerID]
	if !exists {
		return false
	}

	player.Card = card

	// Broadcast vote submitted event (but not the actual vote)
	r.broadcastEvent(Event{
		Type: EventTypeVoteSubmitted,
		Payload: map[string]string{
			"name": player.Name,
		},
	})

	return true
}

// RevealCards reveals all players' cards
func (r *Room) RevealCards(initiatorID string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[initiatorID]
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
func (r *Room) ResetVoting(initiatorID string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[initiatorID]
	if !exists || !player.IsCreator {
		return false
	}

	// If currently revealed, save the current state to history before resetting
	if r.Status == StatusRevealed {
		// Create a deep copy of the current players state
		playersCopy := make(map[string]*Player)
		for id, player := range r.Players {
			playerCopy := *player // Create a copy of the player
			playersCopy[id] = &playerCopy
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
func (r *Room) UpdateLink(initiatorID string, link string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	player, exists := r.Players[initiatorID]
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

// TransferCreator transfers creator role from current creator to another player
func (r *Room) TransferCreator(initiatorID string, newCreatorID string) bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	// Check if initiator is the current creator
	initiator, exists := r.Players[initiatorID]
	if !exists || !initiator.IsCreator {
		return false
	}

	// Check if the target player exists
	newCreator, exists := r.Players[newCreatorID]
	if !exists {
		return false
	}

	// Transfer creator role
	initiator.IsCreator = false
	newCreator.IsCreator = true

	// Broadcast creator transferred event
	r.broadcastEvent(Event{
		Type: EventTypeCreatorTransferred,
		Payload: map[string]interface{}{
			"previousCreator": initiator.Name,
			"newCreator":      newCreator.Name,
		},
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
