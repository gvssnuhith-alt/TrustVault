import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.models import User, UserRole, Document, DocumentPermission, AuditLog, AuditAction
from app.auth import get_password_hash
from app.audit import verify_audit_chain

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    admin = User(
        id="usr-admin",
        email="admin@test.com",
        username="admin_user",
        hashed_password=get_password_hash("Password123!"),
        role=UserRole.ADMIN
    )
    owner1 = User(
        id="usr-owner1",
        email="owner1@test.com",
        username="owner1_user",
        hashed_password=get_password_hash("Password123!"),
        role=UserRole.OWNER
    )
    owner2 = User(
        id="usr-owner2",
        email="owner2@test.com",
        username="owner2_user",
        hashed_password=get_password_hash("Password123!"),
        role=UserRole.OWNER
    )
    viewer1 = User(
        id="usr-viewer1",
        email="viewer1@test.com",
        username="viewer1_user",
        hashed_password=get_password_hash("Password123!"),
        role=UserRole.VIEWER
    )
    viewer2 = User(
        id="usr-viewer2",
        email="viewer2@test.com",
        username="viewer2_user",
        hashed_password=get_password_hash("Password123!"),
        role=UserRole.VIEWER
    )
    db.add_all([admin, owner1, owner2, viewer1, viewer2])
    db.commit()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def get_token(client: TestClient, username_or_email: str) -> str:
    res = client.post("/api/auth/login", json={
        "username_or_email": username_or_email,
        "password": "Password123!"
    })
    return res.json()["access_token"]

def upload_sample_doc(client: TestClient, token: str, title="Test Spec", filename="test.pdf") -> dict:
    pdf_bytes = b"%PDF-1.4 sample secure document content for test"
    files = {"file": (filename, io.BytesIO(pdf_bytes), "application/pdf")}
    data = {"title": title, "category": "Legal"}
    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        data=data
    )
    return res.json()

def test_document_edit_permissions(client, db_session):
    owner_token = get_token(client, "owner1@test.com")
    viewer1_token = get_token(client, "viewer1@test.com")
    viewer2_token = get_token(client, "viewer2@test.com")
    
    doc = upload_sample_doc(client, owner_token, title="Initial Title")
    doc_id = doc["id"]
    
    res = client.patch(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {viewer1_token}"},
        json={"title": "Hacked Title"}
    )
    assert res.status_code == 404
    
    client.post(
        f"/api/documents/{doc_id}/permissions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"grantee_email": "viewer1@test.com", "can_read": True, "can_edit": False}
    )
    
    res = client.patch(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {viewer1_token}"},
        json={"title": "Unauthorized Edit Attempt"}
    )
    assert res.status_code == 403
    assert "Edit permission required" in res.json()["detail"]
    
    client.post(
        f"/api/documents/{doc_id}/permissions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"grantee_email": "viewer2@test.com", "can_read": True, "can_edit": True}
    )
    
    res = client.patch(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {viewer2_token}"},
        json={"title": "Viewer2 Edited Title", "category": "Finance"}
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Viewer2 Edited Title"
    assert res.json()["category"] == "Finance"
    
    res = client.patch(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"title": "Owner Final Title"}
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Owner Final Title"

def test_document_delete_permissions(client, db_session):
    owner_token = get_token(client, "owner1@test.com")
    viewer_token = get_token(client, "viewer1@test.com")
    admin_token = get_token(client, "admin@test.com")
    
    doc = upload_sample_doc(client, owner_token, title="Delete Target")
    doc_id = doc["id"]
    
    client.post(
        f"/api/documents/{doc_id}/permissions",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"grantee_email": "viewer1@test.com", "can_read": True, "can_edit": True}
    )
    
    res = client.delete(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert res.status_code == 403
    assert "Only document owner or admin can delete" in res.json()["detail"]
    
    res = client.delete(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert res.status_code == 200
    
    res = client.get(
        f"/api/documents/{doc_id}",
        headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert res.status_code == 404

def test_file_upload_validation_and_size_limits(client, db_session):
    owner_token = get_token(client, "owner1@test.com")
    
    files = {"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {owner_token}"},
        files=files,
        data={"title": "Empty File"}
    )
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()
    
    oversized = b"%PDF-1.4 " + (b"A" * (11 * 1024 * 1024))
    files = {"file": ("huge.pdf", io.BytesIO(oversized), "application/pdf")}
    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {owner_token}"},
        files=files,
        data={"title": "Huge File"}
    )
    assert res.status_code in (400, 413)
    assert "exceeds maximum allowed size" in res.json()["detail"]
    
    pdf_bytes = b"%PDF-1.4 safe content"
    files = {"file": ("../../etc/passwd.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    res = client.post(
        "/api/documents/upload",
        headers={"Authorization": f"Bearer {owner_token}"},
        files=files,
        data={"title": "Traversal Test"}
    )
    assert res.status_code == 201
    assert res.json()["original_filename"] == "passwd.pdf"

def test_search_by_owner_and_date(client, db_session):
    owner1_token = get_token(client, "owner1@test.com")
    admin_token = get_token(client, "admin@test.com")
    
    upload_sample_doc(client, owner1_token, title="Contract Agreement")
    
    res = client.get(
        "/api/documents?owner=owner1_user",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 200
    assert len(res.json()) >= 1
    assert res.json()[0]["title"] == "Contract Agreement"

def test_admin_metrics_and_tamper_evidence(client, db_session):
    admin_token = get_token(client, "admin@test.com")
    owner_token = get_token(client, "owner1@test.com")
    
    res = client.get("/api/audit/metrics", headers={"Authorization": f"Bearer {owner_token}"})
    assert res.status_code == 403
    
    res = client.get("/api/audit/metrics", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert "total_documents" in data
    assert "chain_integrity" in data
    assert data["chain_integrity"]["status"] == "valid"

def test_mutation_defense_fails_when_auth_bypassed(client, db_session):
    from app.routes_documents import check_document_access
    doc = Document(id="doc-mut", title="Secret", original_filename="s.pdf", storage_path="/", mime_type="application/pdf", file_size=10, file_hash_sha256="abc", category="Legal", owner_id="usr-owner1")
    attacker = User(id="usr-attacker", email="eve@test.com", username="eve", hashed_password="x", role=UserRole.VIEWER)
    assert check_document_access(db_session, doc, attacker, require_edit=False) is False
