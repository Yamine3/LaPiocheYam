import Fluent
import Vapor

struct MemberController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        let members = routes.grouped("members")
        members.get(use: index)
        members.post(use: create)
        members.get(":memberID", use: show)
        members.put(":memberID", use: update)
        members.delete(":memberID", use: delete)
        members.get(":memberID", "loans", use: getLoans)
    }

    @Sendable
    func index(req: Request) async throws -> [MemberDTO] {
        try await Member.query(on: req.db).all().map { $0.toDTO() }
    }

    @Sendable
    func create(req: Request) async throws -> Response {
        try CreateMemberDTO.validate(content: req)
        let dto = try req.content.decode(CreateMemberDTO.self)

        let emailTaken = try await Member.query(on: req.db)
            .filter(\.$email == dto.email)
            .count() > 0
        guard !emailTaken else {
            throw Abort(.conflict, reason: "A member with this email already exists")
        }

        let member = dto.toModel()
        try await member.save(on: req.db)
        return try await member.toDTO().encodeResponse(status: .created, for: req)
    }

    @Sendable
    func show(req: Request) async throws -> MemberDTO {
        guard let memberID = req.parameters.get("memberID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Invalid member id")
        }
        guard let member = try await Member.find(memberID, on: req.db) else {
            throw Abort(.notFound, reason: "Member not found")
        }
        return member.toDTO()
    }
    
    private func findMember(_ req: Request) async throws -> Member {
        guard let memberID = req.parameters.get("memberID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Invalid member id")
        }
        guard let member = try await Member.query(on: req.db)
            .filter(\.$id == memberID)
            .with(\.$loans)
            .first()
                else {
            throw Abort(.notFound, reason: "Member not found")
        }
        return member
    }
    
    @Sendable
    func update(req: Request) async throws -> MemberDTO {
        try UpdateMemberDTO.validate(content: req)
        let member = try await findMember(req)
        
        let dto = try req.content.decode(UpdateMemberDTO.self)
        
        let emailTaken = try await Member.query(on: req.db)
            .filter(\.$email == dto.email)
            .filter(\.$id != member.id!)
            .count() > 0
        guard !emailTaken else {
            throw Abort(.conflict, reason: "A member with this email already exists")
        }
        
        member.name = dto.name
        member.email = dto.email

        try await member.save(on: req.db)
        return member.toDTO()
    }
    
    @Sendable
    func delete(req: Request) async throws -> HTTPStatus {
        let member = try await findMember(req)

        guard member.loans.isEmpty else {
            throw Abort(.conflict, reason: "A member with loans cannot be deleted")
        }

        try await req.db.transaction { db in
            try await member.delete(on: db)
        }
        return .noContent
    }
    
    @Sendable
    func getLoans(req: Request) async throws -> [LoanDTO] {
        let member = try await findMember(req)

        return member.loans.map { $0.toDTO() }
    }
}
