#!/bin/bash
# =============================================================================
# MinIO Initialization Script
# =============================================================================
# This script runs when the MinIO container starts to initialize buckets
# and configure access policies.
# =============================================================================

set -e

echo "==> Waiting for MinIO to be ready..."
sleep 5

echo "==> Configuring MinIO client..."
mc alias set myminio http://localhost:9000 ${MINIO_ROOT_USER:-minio} ${MINIO_ROOT_PASSWORD:-minio123} || true

echo "==> Creating bucket: ${S3_BUCKET:-dam-assets}..."
mc mb myminio/${S3_BUCKET:-dam-assets} --ignore-existing || true

echo "==> Setting bucket policy to public read..."
mc anonymous set public myminio/${S3_BUCKET:-dam-assets} || true

echo "==> Creating uploads directory structure..."
mc mb myminio/${S3_BUCKET:-dam-assets}/uploads --ignore-existing || true
mc mb myminio/${S3_BUCKET:-dam-assets}/processed --ignore-existing || true
mc mb myminio/${S3_BUCKET:-dam-assets}/thumbnails --ignore-existing || true
mc mb myminio/${S3_BUCKET:-dam-assets}/exports --ignore-existing || true

echo "==> MinIO initialization complete!"
