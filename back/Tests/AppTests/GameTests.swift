@testable import App
import XCTVapor

final class GameTests: XCTestCase {
    func testCreateGameReturnsCreated() async throws {
        try await withApp { app in
            try await app.test(.POST, "games", beforeRequest: { req in
                try req.content.encode(CreateGameDTO(
                    title: "Catan", minPlayers: 3, maxPlayers: 4, durationMinutes: 90
                ))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .created)
                let game = try res.content.decode(GameDTO.self)
                XCTAssertEqual(game.title, "Catan")
                XCTAssertTrue(game.isAvailable)
            })
        }
    }
    
    func testCreateGameWithEmptyTitleIsRejected() async throws {
        try await withApp { app in
            try await app.test(.POST, "games", beforeRequest: { req in
                try req.content.encode(CreateGameDTO(
                    title: "", minPlayers: 3, maxPlayers: 4, durationMinutes: 90
                ))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }
    
    func testCreateGameWithInvertedPlayerBoundsIsRejected() async throws {
        try await withApp { app in
            try await app.test(.POST, "games", beforeRequest: { req in
                try req.content.encode(CreateGameDTO(
                    title: "Catan", minPlayers: 5, maxPlayers: 2, durationMinutes: 90
                ))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }
    
    func testListGames() async throws {
        try await withApp { app in
            _ = try await createGame(app, title: "Catan")
            _ = try await createGame(app, title: "Dixit")
            
            try await app.test(.GET, "games", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode([GameDTO].self).count, 2)
            })
        }
    }
    
    func testShowGame() async throws {
        try await withApp { app in
            let game = try await createGame(app)
            let id = try XCTUnwrap(game.id)
            
            try await app.test(.GET, "games/\(id)", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(try res.content.decode(GameDTO.self).id, id)
            })
        }
    }
    
    func testShowUnknownGameReturnsNotFound() async throws {
        try await withApp { app in
            try await app.test(.GET, "games/\(UUID())", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .notFound)
            })
        }
    }
    
    func testShowGameWithMalformedIDReturnsBadRequest() async throws {
        try await withApp { app in
            try await app.test(.GET, "games/not-a-uuid", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }
    
    func testPreflightRequestFromAnotherOriginIsAllowed() async throws {
        try await withApp { app in
            try await app.test(.OPTIONS, "games", beforeRequest: { req in
                req.headers.replaceOrAdd(name: .origin, value: "http://localhost:8080")
                req.headers.replaceOrAdd(name: .accessControlRequestMethod, value: "POST")
                req.headers.replaceOrAdd(name: .accessControlRequestHeaders, value: "content-type")
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .ok)
                XCTAssertEqual(res.headers.first(name: .accessControlAllowOrigin), "*")
                XCTAssertTrue(res.headers[.accessControlAllowMethods].joined(separator: ",").contains("POST"))
            })
        }
    }
    
    func testErrorResponsesCarryTheCorsHeaders() async throws {
        try await withApp { app in
            try await app.test(.GET, "games/not-a-uuid", beforeRequest: { req in
                req.headers.replaceOrAdd(name: .origin, value: "http://localhost:8080")
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .badRequest)
                XCTAssertEqual(res.headers.first(name: .accessControlAllowOrigin), "*")
            })
        }
    }
    
    func testDeleteGame() async throws {
        try await withApp { app in
            let gameToDelete = try await createGame(app, title : "tag team")
            
            try await app.test(
                .DELETE, "games/\(gameToDelete.id!)",
                beforeRequest: { req in
                    req.headers.replaceOrAdd(name: .origin, value: "http://localhost:8080")
                }, afterResponse: { res async throws in
                    XCTAssertEqual(res.status, .noContent)
                })
            
        }
    }
    
    func testUpdateGame() async throws {
        try await withApp { app in
            let gameToUpdate = try await createGame(app, title : "tag team")
            
            let updateDTO = UpdateGameDTO(title: "OuiOui", minPlayers: 10, maxPlayers: 13, durationMinutes: 50)
            
            try await app.test(
                .PUT, "games/\(gameToUpdate.id!)",
                beforeRequest: { req in
                    req.headers.replaceOrAdd(name: .origin, value: "http://localhost:8080")
                    try req.content.encode(updateDTO)
                }, afterResponse: { res async throws in
                    XCTAssertEqual(res.status, .ok)
                    let updated = try await Game.find(gameToUpdate.id, on: app.db)
                    XCTAssertEqual(updated!.title, "OuiOui")
                })
            
        }
    }
    
    func testSearchGames() async throws {
        try await withApp { app in
            try await Game(title: "Catan", minPlayers: 3, maxPlayers: 4, durationMinutes: 90).save(on: app.db)
            try await Game(title: "Dixit", minPlayers: 3, maxPlayers: 6, durationMinutes: 30).save(on: app.db)
            try await Game(title: "Tag Team", minPlayers: 2, maxPlayers: 2, durationMinutes: 15).save(on: app.db)

            try await app.test(.GET, "games?players=3&maxDuration=45", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .ok)
                let games = try res.content.decode([GameDTO].self)
                XCTAssertEqual(games.count, 1)
                XCTAssertEqual(games[0].title, "Dixit")
            })
        }
    }

    func testSearchGamesWithNoPlayers() async throws {
        try await withApp { app in
            try await app.test(.GET, "games?players=0", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }
}
