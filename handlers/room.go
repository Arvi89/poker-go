package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/poker/db"
	"github.com/user/poker/models"
)

// RoomHandler handles all room-related requests
type RoomHandler struct {
	store *db.Store
}

// NewRoomHandler creates a new RoomHandler
func NewRoomHandler(store *db.Store) *RoomHandler {
	return &RoomHandler{
		store: store,
	}
}

// CreateRoom handles room creation requests
func (h *RoomHandler) CreateRoom(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	// Validate name
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	room := h.store.CreateRoom(req.Name)
	c.JSON(http.StatusCreated, gin.H{"roomId": room.ID})
}

// JoinRoom handles requests to join a room
func (h *RoomHandler) JoinRoom(c *gin.Context) {
	roomID := c.Param("id")
	var req struct {
		Name string `json:"name" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	// Validate name
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrRoomNotFound.Error()})
		return
	}

	if success := room.AddPlayer(req.Name); !success {
		c.JSON(http.StatusConflict, gin.H{"error": models.ErrPlayerExists.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "joined"})
}

// LeaveRoom handles requests to leave a room
func (h *RoomHandler) LeaveRoom(c *gin.Context) {
	roomID := c.Param("id")
	playerName := c.Query("name")

	if playerName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrRoomNotFound.Error()})
		return
	}

	if success := room.RemovePlayer(playerName); !success {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrPlayerNotFound.Error()})
		return
	}

	// Cleanup if the room is empty
	room.Mutex.RLock()
	isEmpty := len(room.Players) == 0
	room.Mutex.RUnlock()

	if isEmpty {
		h.store.DeleteRoom(roomID)
	}

	c.JSON(http.StatusOK, gin.H{"status": "left"})
}

// GetRoom handles requests to get room information
func (h *RoomHandler) GetRoom(c *gin.Context) {
	roomID := c.Param("id")
	playerName := c.Query("name")

	if playerName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrRoomNotFound.Error()})
		return
	}

	c.JSON(http.StatusOK, room)
}

// SubmitVote handles vote submission requests
func (h *RoomHandler) SubmitVote(c *gin.Context) {
	roomID := c.Param("id")
	var req struct {
		Name string      `json:"name" binding:"required"`
		Card models.Card `json:"card" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrRoomNotFound.Error()})
		return
	}

	if success := room.SubmitVote(req.Name, req.Card); !success {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrPlayerNotFound.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "vote submitted"})
}

// RevealCards handles requests to reveal all cards
func (h *RoomHandler) RevealCards(c *gin.Context) {
	roomID := c.Param("id")
	playerName := c.Query("name")

	if playerName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrRoomNotFound.Error()})
		return
	}

	if success := room.RevealCards(playerName); !success {
		c.JSON(http.StatusForbidden, gin.H{"error": models.ErrNotCreator.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "cards revealed"})
}

// ResetVoting handles requests to reset voting
func (h *RoomHandler) ResetVoting(c *gin.Context) {
	roomID := c.Param("id")
	playerName := c.Query("name")

	if playerName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrRoomNotFound.Error()})
		return
	}

	if success := room.ResetVoting(playerName); !success {
		c.JSON(http.StatusForbidden, gin.H{"error": models.ErrNotCreator.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "voting reset"})
}

// UpdateLink handles requests to update the room link
func (h *RoomHandler) UpdateLink(c *gin.Context) {
	roomID := c.Param("id")
	playerName := c.Query("name")

	var req struct {
		Link string `json:"link" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	if playerName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrRoomNotFound.Error()})
		return
	}

	if success := room.UpdateLink(playerName, req.Link); !success {
		c.JSON(http.StatusForbidden, gin.H{"error": models.ErrNotCreator.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "link updated"})
}

// StreamEvents handles SSE (Server-Sent Events) for real-time updates
func (h *RoomHandler) StreamEvents(c *gin.Context) {
	roomID := c.Param("id")
	playerName := c.Query("name")

	if playerName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInvalidPlayerName.Error()})
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": models.ErrRoomNotFound.Error()})
		return
	}

	// Set headers for SSE
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")

	// Create a channel for this client
	events := room.Subscribe()

	// Ensure the client is removed when the connection is closed
	defer room.Unsubscribe(events)

	// Send initial room state
	initialEvent := models.Event{
		Type:    models.EventTypeInitialState,
		Payload: room,
	}

	c.SSEvent("message", initialEvent)
	c.Writer.Flush()

	// Keep the connection alive with a ticker
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Channel to notify of client disconnect
	clientGone := c.Writer.CloseNotify()

	// Handle events
	for {
		select {
		case event := <-events:
			// Send event to client
			c.SSEvent("message", event)
			c.Writer.Flush()
		case <-ticker.C:
			// Send a keep-alive ping
			c.SSEvent("ping", nil)
			c.Writer.Flush()
		case <-clientGone:
			// Client disconnected
			room.RemovePlayer(playerName) // Clean up if player is gone
			return
		}
	}
}
