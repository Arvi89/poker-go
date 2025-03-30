package handlers

import (
	"net/http"
	"time"

	"github.com/Arvi89/poker-go/db"
	"github.com/Arvi89/poker-go/models"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// Package-level WebSocket upgrader
var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

// standardResponse sends a consistent JSON response
func standardResponse(c *gin.Context, code int, status string, data interface{}, err string) {
	response := gin.H{"status": status}

	if data != nil {
		response["data"] = data
	}

	if err != "" {
		response["error"] = err
	}

	c.JSON(code, response)
}

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
		standardResponse(c, http.StatusBadRequest, "error", nil, models.ErrInvalidPlayerName.Error())
		return
	}

	// Validate name
	if req.Name == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, models.ErrInvalidPlayerName.Error())
		return
	}

	room := h.store.CreateRoom(req.Name)

	// Find the creator player ID
	var creatorID string
	room.Mutex.RLock()
	for id, player := range room.Players {
		if player.IsCreator {
			creatorID = id
			break
		}
	}
	room.Mutex.RUnlock()

	standardResponse(c, http.StatusCreated, "created", gin.H{
		"roomId":   room.ID,
		"playerID": creatorID,
	}, "")
}

// JoinRoom handles requests to join a room
func (h *RoomHandler) JoinRoom(c *gin.Context) {
	roomID := c.Param("id")
	var req struct {
		Name string `json:"name" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		standardResponse(c, http.StatusBadRequest, "error", nil, models.ErrInvalidPlayerName.Error())
		return
	}

	// Validate name
	if req.Name == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, models.ErrInvalidPlayerName.Error())
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	playerID, success := room.AddPlayer(req.Name)
	if !success {
		standardResponse(c, http.StatusConflict, "error", nil, models.ErrPlayerExists.Error())
		return
	}

	standardResponse(c, http.StatusOK, "joined", gin.H{"playerID": playerID}, "")
}

// LeaveRoom handles requests to leave a room
func (h *RoomHandler) LeaveRoom(c *gin.Context) {
	roomID := c.Param("id")
	playerID := c.Query("playerID")

	if playerID == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid player ID")
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	if success := room.RemovePlayer(playerID); !success {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrPlayerNotFound.Error())
		return
	}

	// Cleanup if the room is empty
	room.Mutex.RLock()
	isEmpty := len(room.Players) == 0
	room.Mutex.RUnlock()

	if isEmpty {
		h.store.DeleteRoom(roomID)
	}

	standardResponse(c, http.StatusOK, "left", nil, "")
}

// GetRoom handles requests to get room information
func (h *RoomHandler) GetRoom(c *gin.Context) {
	roomID := c.Param("id")
	playerID := c.Query("playerID")

	if playerID == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid player ID")
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	// Verify player exists in the room
	room.Mutex.RLock()
	_, playerExists := room.Players[playerID]
	room.Mutex.RUnlock()

	if !playerExists {
		standardResponse(c, http.StatusForbidden, "error", nil, models.ErrPlayerNotFound.Error())
		return
	}

	// Return the full room data as-is
	c.JSON(http.StatusOK, room)
}

// SubmitVote handles vote submission requests
func (h *RoomHandler) SubmitVote(c *gin.Context) {
	roomID := c.Param("id")
	var req struct {
		PlayerID string      `json:"playerID" binding:"required"`
		Card     models.Card `json:"card" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid request format")
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	if success := room.SubmitVote(req.PlayerID, req.Card); !success {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrPlayerNotFound.Error())
		return
	}

	standardResponse(c, http.StatusOK, "vote_submitted", nil, "")
}

// RevealCards handles requests to reveal all cards
func (h *RoomHandler) RevealCards(c *gin.Context) {
	roomID := c.Param("id")
	playerID := c.Query("playerID")

	if playerID == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid player ID")
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	if success := room.RevealCards(playerID); !success {
		standardResponse(c, http.StatusForbidden, "error", nil, models.ErrNotCreator.Error())
		return
	}

	standardResponse(c, http.StatusOK, "cards_revealed", nil, "")
}

// ResetVoting handles requests to reset voting
func (h *RoomHandler) ResetVoting(c *gin.Context) {
	roomID := c.Param("id")
	playerID := c.Query("playerID")

	if playerID == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid player ID")
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	if success := room.ResetVoting(playerID); !success {
		standardResponse(c, http.StatusForbidden, "error", nil, models.ErrNotCreator.Error())
		return
	}

	standardResponse(c, http.StatusOK, "voting_reset", nil, "")
}

// UpdateLink handles requests to update the room link
func (h *RoomHandler) UpdateLink(c *gin.Context) {
	roomID := c.Param("id")
	playerID := c.Query("playerID")

	var req struct {
		Link string `json:"link"`
	}

	if err := c.BindJSON(&req); err != nil {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid request format")
		return
	}

	if playerID == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid player ID")
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	if success := room.UpdateLink(playerID, req.Link); !success {
		standardResponse(c, http.StatusForbidden, "error", nil, models.ErrNotCreator.Error())
		return
	}

	standardResponse(c, http.StatusOK, "link_updated", nil, "")
}

// TransferCreator handles requests to transfer the creator role
func (h *RoomHandler) TransferCreator(c *gin.Context) {
	roomID := c.Param("id")
	playerID := c.Query("playerID")

	var req struct {
		NewCreatorID string `json:"newCreatorID" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid request format")
		return
	}

	if playerID == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid player ID")
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	if success := room.TransferCreator(playerID, req.NewCreatorID); !success {
		standardResponse(c, http.StatusForbidden, "error", nil, models.ErrNotCreator.Error())
		return
	}

	standardResponse(c, http.StatusOK, "creator_transferred", nil, "")
}

// WebSocketHandler handles WebSocket connections for real-time updates
func (h *RoomHandler) WebSocketHandler(c *gin.Context) {
	roomID := c.Param("id")
	playerID := c.Query("playerID")

	if playerID == "" {
		standardResponse(c, http.StatusBadRequest, "error", nil, "Invalid player ID")
		return
	}

	room, exists := h.store.GetRoom(roomID)
	if !exists {
		standardResponse(c, http.StatusNotFound, "error", nil, models.ErrRoomNotFound.Error())
		return
	}

	// Use the shared upgrader instead of creating a new one each time
	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		standardResponse(c, http.StatusInternalServerError, "error", nil, "Could not upgrade to WebSocket")
		return
	}
	defer conn.Close()

	// Create a channel for this client
	events := room.Subscribe()
	defer room.Unsubscribe(events)

	// Send initial room state
	initialEvent := models.Event{
		Type:    models.EventTypeInitialState,
		Payload: room,
	}

	if err := conn.WriteJSON(initialEvent); err != nil {
		return
	}

	// Setup ping ticker for keep-alive
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Create a channel to handle client disconnections
	done := make(chan struct{})

	// Handle incoming messages in a separate goroutine
	go handleIncomingMessages(conn, room, playerID, done)

	// Main event loop
	for {
		select {
		case event := <-events:
			if err := conn.WriteJSON(event); err != nil {
				return
			}
		case <-ticker.C:
			if err := conn.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
				return
			}
		case <-done:
			return
		}
	}
}

// handleIncomingMessages processes messages from the client
func handleIncomingMessages(conn *websocket.Conn, room *models.Room, playerID string, done chan struct{}) {
	defer close(done)

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			// Client disconnected or error occurred
			room.RemovePlayer(playerID)
			return
		}
	}
}
