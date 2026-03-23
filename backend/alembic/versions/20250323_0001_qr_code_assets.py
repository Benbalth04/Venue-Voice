"""Add qr_codes redirect/has_logo and qr_code_assets table.

Revision ID: 20250323_0001
Revises:
Create Date: 2025-03-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20250323_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("qr_codes", sa.Column("redirect_url", sa.Text(), nullable=True))
    op.add_column(
        "qr_codes",
        sa.Column("has_logo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.create_table(
        "qr_code_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("qr_code_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("format", sa.String(length=8), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("public_url", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.CheckConstraint("format IN ('svg', 'png', 'jpeg')", name="ck_qr_code_assets_format"),
        sa.ForeignKeyConstraint(["qr_code_id"], ["qr_codes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("qr_code_id", "format", name="uq_qr_code_assets_qr_code_id_format"),
    )
    op.create_index("idx_qr_code_assets_qr_code_id", "qr_code_assets", ["qr_code_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_qr_code_assets_qr_code_id", table_name="qr_code_assets")
    op.drop_table("qr_code_assets")
    op.drop_column("qr_codes", "has_logo")
    op.drop_column("qr_codes", "redirect_url")
