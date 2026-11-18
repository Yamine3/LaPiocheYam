import Fluent
import Vapor

struct GameController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        let games = routes.grouped("games")
        games.get(use: index)
        games.post(use: create)
        games.get(":gameID", use: show)
        games.put(":gameID", use: update)
        games.delete(":gameID", use: delete)
    }
    
    @Sendable
    func index(req: Request) async throws -> [GameDTO] {
        var games = try await Game.query(on: req.db)
            .with(\.$loans)
            .all()
        
        if let q = req.query[String.self, at: "q"] {
            games = games.filter {
                $0.title.lowercased().contains(q.lowercased())
            }
        }

        if let text = req.query[String.self, at: "players"] {
            guard let players = Int(text), players > 0 else {
                throw Abort(
                    .badRequest,
                    reason: "players must be a positive number"
                )
            }
            games = games.filter {
                $0.minPlayers <= players && $0.maxPlayers >= players
            }
        }

        if let text = req.query[String.self, at: "maxDuration"] {
            guard let maxDuration = Int(text), maxDuration > 0 else {
                throw Abort(
                    .badRequest,
                    reason: "maxDuration must be a positive number"
                )
            }
            games = games.filter {
                $0.durationMinutes <= maxDuration
            }
        }

        
        return games.map { $0.toDTO() }
    }
    
    @Sendable
    func create(req: Request) async throws -> Response {
        try CreateGameDTO.validate(content: req)
        let dto = try req.content.decode(CreateGameDTO.self)
        try dto.ensureConsistentPlayerCount()
        
        let game = dto.toModel()
        try await game.save(on: req.db)
        return try await game.toDTO().encodeResponse(status: .created, for: req)
    }
    
    @Sendable
    func show(req: Request) async throws -> GameDTO {
        try await findGame(req).toDTO()
    }
    
    private func findGame(_ req: Request) async throws -> Game {
        guard let gameID = req.parameters.get("gameID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Invalid game id")
        }
        guard let game = try await Game.query(on: req.db)
            .filter(\.$id == gameID)
            .with(\.$loans)
            .first()
                else {
            throw Abort(.notFound, reason: "Game not found")
        }
        return game
    }
    
    @Sendable
    func update(req: Request) async throws -> Response {
        try UpdateGameDTO.validate(content: req)
        let game = try await findGame(req)
        
        let dto = try req.content.decode(UpdateGameDTO.self)
        try dto.ensureConsistentPlayerCount()
        
        game.title = dto.title
        game.minPlayers = dto.minPlayers
        game.maxPlayers = dto.maxPlayers
        game.durationMinutes = dto.durationMinutes
        
        try await game.save(on: req.db)
        return try await game.toDTO().encodeResponse(for: req)
    }
    
    @Sendable
    func delete(req: Request) async throws -> HTTPStatus {
        let game = try await findGame(req)
        
        guard game.loans.isEmpty else {
            throw Abort(
                .conflict,
                reason: "A game with loans cannot be deleted"
            )
        }
        
        try await req.db.transaction { db in
            try await game.delete(on: db)
        }
        return .noContent
    }

}
