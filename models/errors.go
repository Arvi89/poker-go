package models

import "errors"

// Common errors
var (
	ErrPlayerNotFound    = errors.New("player not found in room")
	ErrPlayerExists      = errors.New("player already exists in room")
	ErrNotCreator        = errors.New("only the room creator can perform this action")
	ErrInvalidCard       = errors.New("invalid card value")
	ErrRoomNotFound      = errors.New("room not found")
	ErrInvalidPlayerName = errors.New("invalid player name")
)
