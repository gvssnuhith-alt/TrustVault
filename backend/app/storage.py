import os
import io
import hashlib
from typing import Tuple, Generator, BinaryIO, Optional
from fastapi import UploadFile, HTTPException, status
from app.config import settings

class StorageManager:
    """
    Unified Storage Manager supporting local disk and S3-compatible object storage
    (Cloudflare R2, AWS S3, MinIO).
    Preserves SHA-256 integrity, private access, and zero public exposure.
    """
    def __init__(self):
        self.backend = settings.STORAGE_BACKEND.lower()
        self._s3_client = None

        if self.backend == "s3":
            try:
                import boto3
                from botocore.config import Config
                
                cfg = Config(signature_version="s3v4")
                kwargs = {
                    "config": cfg,
                    "region_name": settings.S3_REGION_NAME or "auto"
                }
                if settings.S3_ENDPOINT_URL:
                    kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
                if settings.S3_ACCESS_KEY_ID and settings.S3_SECRET_ACCESS_KEY:
                    kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY_ID
                    kwargs["aws_secret_access_key"] = settings.S3_SECRET_ACCESS_KEY

                self._s3_client = boto3.client("s3", **kwargs)
                self.bucket = settings.S3_BUCKET_NAME
            except Exception as e:
                # Fallback to local if S3 client configuration fails
                self.backend = "local"
                self._s3_client = None

        if self.backend == "local":
            os.makedirs(settings.STORAGE_DIR, exist_ok=True)

    async def save_file(
        self,
        file: UploadFile,
        file_uuid: str,
        ext: str,
        max_size: int = 10 * 1024 * 1024
    ) -> Tuple[str, int, str]:
        """
        Saves file to chosen storage backend.
        Returns: (storage_identifier, file_size, sha256_hash)
        """
        hasher = hashlib.sha256()
        file_size = 0
        storage_filename = f"{file_uuid}{ext}.bin"

        if self.backend == "s3" and self._s3_client:
            key = f"documents/{storage_filename}"
            buffer = io.BytesIO()
            while chunk := await file.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > max_size:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowed size of {max_size // (1024 * 1024)}MB."
                    )
                hasher.update(chunk)
                buffer.write(chunk)

            buffer.seek(0)
            self._s3_client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=buffer.getvalue(),
                ContentType="application/octet-stream"
            )
            return key, file_size, hasher.hexdigest()
        else:
            # Local storage backend
            os.makedirs(settings.STORAGE_DIR, exist_ok=True)
            storage_path = os.path.join(settings.STORAGE_DIR, storage_filename)
            try:
                import aiofiles
                async with aiofiles.open(storage_path, "wb") as out_file:
                    while chunk := await file.read(1024 * 1024):
                        file_size += len(chunk)
                        if file_size > max_size:
                            raise HTTPException(
                                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                detail=f"File exceeds maximum allowed size of {max_size // (1024 * 1024)}MB."
                            )
                        hasher.update(chunk)
                        await out_file.write(chunk)
            except Exception:
                if os.path.exists(storage_path):
                    os.remove(storage_path)
                raise

            return storage_path, file_size, hasher.hexdigest()

    def exists(self, storage_identifier: str) -> bool:
        if self.backend == "s3" and self._s3_client:
            try:
                self._s3_client.head_object(Bucket=self.bucket, Key=storage_identifier)
                return True
            except Exception:
                return False
        return os.path.exists(storage_identifier)

    def delete(self, storage_identifier: str) -> bool:
        if self.backend == "s3" and self._s3_client:
            try:
                self._s3_client.delete_object(Bucket=self.bucket, Key=storage_identifier)
                return True
            except Exception:
                return False
        if os.path.exists(storage_identifier):
            try:
                os.remove(storage_identifier)
                return True
            except OSError:
                return False
        return False

    def get_stream(self, storage_identifier: str) -> Generator[bytes, None, None]:
        if self.backend == "s3" and self._s3_client:
            resp = self._s3_client.get_object(Bucket=self.bucket, Key=storage_identifier)
            stream = resp["Body"]
            while chunk := stream.read(1024 * 1024):
                yield chunk
        else:
            with open(storage_identifier, "rb") as f:
                while chunk := f.read(1024 * 1024):
                    yield chunk

storage_manager = StorageManager()
