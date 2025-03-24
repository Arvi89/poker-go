package main

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/poker/db"
	"github.com/user/poker/handlers"
)

func main() {
	// Create a new Gin router
	router := gin.Default()

	// Create a new store
	store := db.NewStore()

	// Create room handler
	roomHandler := handlers.NewRoomHandler(store)

	// Set up periodic cleanup for empty rooms
	go func() {
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			count := store.CleanupEmptyRooms()
			log.Printf("Cleaned up %d empty rooms", count)
		}
	}()

	// Serve static files
	router.Static("/static", "./static")
	router.StaticFile("/favicon.ico", "./static/favicon.ico")

	// Serve the main application page
	router.LoadHTMLGlob("templates/*")
	router.GET("/", func(c *gin.Context) {
		c.HTML(200, "index.html", nil)
	})

	// Route for directly accessing a room
	router.GET("/room/:id", func(c *gin.Context) {
		c.HTML(200, "index.html", nil)
	})

	// API Routes
	api := router.Group("/api")
	{
		// Room creation
		api.POST("/rooms", roomHandler.CreateRoom)

		// Room routes
		rooms := api.Group("/rooms/:id")
		{
			rooms.GET("", roomHandler.GetRoom)
			rooms.POST("/join", roomHandler.JoinRoom)
			rooms.GET("/leave", roomHandler.LeaveRoom)
			rooms.POST("/vote", roomHandler.SubmitVote)
			rooms.GET("/reveal", roomHandler.RevealCards)
			rooms.GET("/reset", roomHandler.ResetVoting)
			rooms.POST("/link", roomHandler.UpdateLink)

			// SSE endpoint for real-time updates
			rooms.GET("/events", roomHandler.StreamEvents)
		}
	}

	// Start the server
	log.Println("Starting server on :8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
