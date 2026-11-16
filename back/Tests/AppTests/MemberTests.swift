@testable import App
import XCTVapor

final class MemberTests: XCTestCase {
    func testCreateMemberReturnsCreated() async throws {
        try await withApp { app in
            try await app.test(.POST, "members", beforeRequest: { req in
                try req.content.encode(CreateMemberDTO(name: "Camille", email: "camille@example.com"))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .created)
                XCTAssertEqual(try res.content.decode(MemberDTO.self).name, "Camille")
            })
        }
    }

    func testCreateMemberWithInvalidEmailIsRejected() async throws {
        try await withApp { app in
            try await app.test(.POST, "members", beforeRequest: { req in
                try req.content.encode(CreateMemberDTO(name: "Camille", email: "not-an-email"))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .badRequest)
            })
        }
    }

    func testCreateMemberWithDuplicateEmailReturnsConflict() async throws {
        try await withApp { app in
            _ = try await createMember(app)

            try await app.test(.POST, "members", beforeRequest: { req in
                try req.content.encode(CreateMemberDTO(name: "Autre", email: "camille@example.com"))
            }, afterResponse: { res async throws in
                XCTAssertEqual(res.status, .conflict)
            })
        }
    }

    func testShowUnknownMemberReturnsNotFound() async throws {
        try await withApp { app in
            try await app.test(.GET, "members/\(UUID())", afterResponse: { res async throws in
                XCTAssertEqual(res.status, .notFound)
            })
        }
    }
    
    func testDeleteMember() async throws {
        try await withApp { app in
            let memberToDelete = try await createMember(app, name: "ouioui",email: "ouioui@gmail.com")
            
            try await app.test(
                .DELETE, "members/\(memberToDelete.id!)",
                beforeRequest: { req in
                    req.headers.replaceOrAdd(name: .origin, value: "http://localhost:8080")
                }, afterResponse: { res async throws in
                    XCTAssertEqual(res.status, .noContent)
                })
            
        }
    }
    
    func testUpdateGame() async throws {
        try await withApp { app in
            let memberToUpdate = try await createMember(app, name: "ouioui",email: "ouioui@gmail.com")
            
            let updateDTO = UpdateMemberDTO(name: "Ouipuoi", email: "Ouipuoi@gmail.com")
            
            try await app.test(
                .PUT, "members/\(memberToUpdate.id!)",
                beforeRequest: { req in
                    req.headers.replaceOrAdd(name: .origin, value: "http://localhost:8080")
                    try req.content.encode(updateDTO)
                }, afterResponse: { res async throws in
                    XCTAssertEqual(res.status, .ok)
                    let updated = try await Member.find(memberToUpdate.id, on: app.db)
                    XCTAssertEqual(updated!.name, "Ouipuoi")
                    XCTAssertEqual(updated!.email, "Ouipuoi@gmail.com")
                })
            
        }
    }
}
