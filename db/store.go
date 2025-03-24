package db

import (
	"sync"

	"github.com/user/poker/models"
)

// Store is a simple in-memory store for rooms
type Store struct {
	rooms map[string]*models.Room
	mutex sync.RWMutex
}

// NewStore creates a new in-memory store
func NewStore() *Store {
	return &Store{
		rooms: make(map[string]*models.Room),
	}
}

// CreateRoom creates a new room with the given creator name
func (s *Store) CreateRoom(creatorName string) *models.Room {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	room := models.NewRoom(creatorName)
	s.rooms[room.ID] = room

	return room
}

// GetRoom returns a room by ID
func (s *Store) GetRoom(roomID string) (*models.Room, bool) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	room, exists := s.rooms[roomID]
	return room, exists
}

// DeleteRoom removes a room from the store
func (s *Store) DeleteRoom(roomID string) bool {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if _, exists := s.rooms[roomID]; !exists {
		return false
	}

	delete(s.rooms, roomID)
	return true
}

// CleanupEmptyRooms removes rooms that have no players
func (s *Store) CleanupEmptyRooms() int {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	count := 0
	for id, room := range s.rooms {
		room.Mutex.RLock()
		isEmpty := len(room.Players) == 0
		room.Mutex.RUnlock()

		if isEmpty {
			delete(s.rooms, id)
			count++
		}
	}

	return count
}
