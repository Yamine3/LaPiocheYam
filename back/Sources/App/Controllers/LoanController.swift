import Fluent
import Vapor

struct LoanController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        let loans = routes.grouped("loans")
        loans.post(use: create)
        loans.post(":loanID", "return", use: returnGame)
        loans.get("overdue", use: overdue)
    }

    @Sendable
    func create(req: Request) async throws -> Response {
        let dto = try req.content.decode(CreateLoanDTO.self)

        guard let game = try await Game.query(on: req.db)
            .filter(\.$id == dto.gameID)
            .with(\.$loans)
            .first()
        else {
            throw Abort(.notFound, reason: "Game not found")
        }
        guard game.isAvailable else {
            throw Abort(.conflict, reason: "Game is already loan")
        }
        
        guard let member = try await Member.find(dto.memberID, on: req.db) else {
            throw Abort(.notFound, reason: "Member not found")
        }

        let now = Date()
        let loan = Loan(
            gameID: try game.requireID(),
            memberID: try member.requireID(),
            borrowedAt: now,
            dueAt: try Loan.dueDate(from: now)
        )
        try await loan.save(on: req.db)
        return try await loan.toDTO().encodeResponse(status: .created, for: req)
    }
    
    @Sendable
    func returnGame(req: Request) async throws -> LoanDTO {
        guard let loanID = req.parameters.get("loanID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Invalid loan id")
        }
        guard let loan = try await Loan.find(loanID, on: req.db) else {
            throw Abort(.notFound, reason: "Loan not found")
        }
        if loan.returnedAt != nil {
            throw Abort(.conflict, reason: "Loan is already returned")
        }
        
        loan.returnedAt = Date()
        
        try await loan.save(on: req.db)
        return loan.toDTO()
    }
    
    @Sendable
    func overdue(req: Request) async throws -> [LoanDTO] {
        let loans = try await Loan.query(on: req.db)
            .filter(\.$returnedAt == nil)
            .filter(\.$dueAt < Date())
            .all()
        return loans.map { $0.toDTO() }
    }
}
