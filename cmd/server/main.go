package main

import (
	"log"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/user/poker/db"
	"github.com/user/poker/handlers"
)

func main() {
	// Create a new Gin router
	router := gin.Default()

	// Configure CORS
	config := cors.DefaultConfig()

	// Read CORS settings from environment
	corsOrigins := os.Getenv("CORS_ORIGINS")
	if corsOrigins != "" {
		// Split by comma and trim spaces
		origins := strings.Split(corsOrigins, ",")
		for i, origin := range origins {
			origins[i] = strings.TrimSpace(origin)
		}
		config.AllowOrigins = origins
		config.AllowAllOrigins = false
	} else {
		// Default origins in development
		config.AllowOrigins = []string{"http://localhost:8080", "https://localhost:8080"}
		config.AllowAllOrigins = false
	}

	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
	config.AllowCredentials = true
	config.MaxAge = 12 * time.Hour
	router.Use(cors.New(config))

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
			rooms.PATCH("", roomHandler.UpdateLink)
			rooms.POST("/transfer-creator", roomHandler.TransferCreator)

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
