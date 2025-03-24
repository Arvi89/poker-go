package models

// Event types
const (
	EventTypeInitialState  = "initial_state"
	EventTypePlayerJoined  = "player_joined"
	EventTypePlayerLeft    = "player_left"
	EventTypeVoteSubmitted = "vote_submitted"
	EventTypeCardsRevealed = "cards_revealed"
	EventTypeVotingReset   = "voting_reset"
	EventTypeLinkUpdated   = "link_updated"
)

// Card represents a planning poker card value
type Card string

// Available planning poker cards
const (
	Unknown  Card = "unknown"
	Zero     Card = "0"
	One      Card = "1"
	Two      Card = "2"
	Three    Card = "3"
	Five     Card = "5"
	Eight    Card = "8"
	Thirteen Card = "13"
	Twenty   Card = "20"
	Forty    Card = "40"
	Hundred  Card = "100"
	Question Card = "?"
	Coffee   Card = "coffee"
)

// Possible voting statuses
const (
	StatusVoting   = "voting"
	StatusRevealed = "revealed"
)
