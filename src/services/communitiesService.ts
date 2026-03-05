import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface Community {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  created_by: string;
  member_count: number;
  is_member?: boolean;
  role?: 'ADMIN' | 'MEMBER';
  created_at: Date;
}

export interface CommunityMember {
  id: string;
  user_id: string;
  community_id: string;
  role: string;
  username: string;
  image: string | null;
  is_verified: boolean;
  joined_at: Date;
}

export const createCommunityService = async (
  userId: string,
  data: { name: string; description?: string; image?: string }
): Promise<Community> => {
  const [community] = await sequelize.query(
    `INSERT INTO communities (name, description, image, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, description, image, created_by, created_at`,
    {
      bind: [
        data.name.trim(),
        data.description?.trim() || null,
        data.image || null,
        userId,
      ],
      type: QueryTypes.INSERT,
    }
  ) as any[];

  const row = Array.isArray(community) ? community[0] : community;
  if (!row) throw { statusCode: 500, message: "Failed to create community" };

  // Add creator as ADMIN member
  await sequelize.query(
    `INSERT INTO community_members (community_id, user_id, role)
     VALUES ($1, $2, 'ADMIN')`,
    { bind: [row.id, userId], type: QueryTypes.INSERT }
  );

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image: row.image,
    created_by: row.created_by,
    member_count: 1,
    is_member: true,
    created_at: row.created_at,
  };
};

/** Communities the current user is a member of (for sidebar / "My Communities") */
export const getMyCommunitiesService = async (
  userId: string,
  limit = 50
): Promise<Community[]> => {
  const rows = await sequelize.query(
    `SELECT 
       c.id,
       c.name,
       c.description,
       c.image,
       c.created_by,
       c.created_at,
       COALESCE(mc.cnt::INTEGER, 0) as member_count,
       true as is_member
     FROM community_members cm
     INNER JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
     LEFT JOIN (
       SELECT community_id, COUNT(*) as cnt
       FROM community_members
       WHERE deleted_at IS NULL
       GROUP BY community_id
     ) mc ON mc.community_id = c.id
     WHERE cm.user_id = $1 AND cm.deleted_at IS NULL
     ORDER BY cm.joined_at DESC
     LIMIT $2`,
    { bind: [userId, limit], type: QueryTypes.SELECT }
  ) as any[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    image: r.image,
    created_by: r.created_by,
    member_count: r.member_count,
    is_member: true,
    created_at: r.created_at,
  }));
};

/** Discover communities (all public, with optional search). Excludes ones user already joined if userId provided. */
export const getDiscoverCommunitiesService = async (
  options: { search?: string; limit?: number; userId?: string }
): Promise<Community[]> => {
  const search = options.search?.trim() || "";
  const limit = Math.min(options.limit || 20, 50);

  let whereClause = "c.deleted_at IS NULL";
  const bind: (string | number)[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause += ` AND (c.name ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`;
    bind.push(`%${search}%`);
    paramIndex++;
  }

  if (options.userId) {
    whereClause += ` AND NOT EXISTS (
      SELECT 1 FROM community_members cm2
      WHERE cm2.community_id = c.id AND cm2.user_id = $${paramIndex} AND cm2.deleted_at IS NULL
    )`;
    bind.push(options.userId);
    paramIndex++;
  }

  bind.push(limit);
  const limitParamIndex = paramIndex;

  const rows = await sequelize.query(
    `SELECT 
       c.id,
       c.name,
       c.description,
       c.image,
       c.created_by,
       c.created_at,
       COALESCE(mc.cnt::INTEGER, 0) as member_count
     FROM communities c
     LEFT JOIN (
       SELECT community_id, COUNT(*) as cnt
       FROM community_members
       WHERE deleted_at IS NULL
       GROUP BY community_id
     ) mc ON mc.community_id = c.id
     WHERE ${whereClause}
     ORDER BY member_count DESC, c.created_at DESC
     LIMIT $${limitParamIndex}`,
    { bind, type: QueryTypes.SELECT }
  ) as any[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    image: r.image,
    created_by: r.created_by,
    member_count: r.member_count,
    is_member: false,
    created_at: r.created_at,
  }));
};

export type DiscoverSort = "newest" | "oldest" | "most_members" | "least_members";
export type DiscoverTimeFilter = "all" | "last_week" | "last_month" | "last_3_months";

export interface DiscoverCommunitiesPaginatedResult {
  communities: (Community & { posts_count?: number; is_member?: boolean })[];
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
}

/** Discover all communities with DB search, pagination (12 per page), sort and time filter. Includes is_member when userId provided. */
export const getDiscoverCommunitiesPaginatedService = async (
  options: {
    search?: string;
    page?: number;
    limit?: number;
    userId?: string;
    sort?: DiscoverSort;
    timeFilter?: DiscoverTimeFilter;
  }
): Promise<DiscoverCommunitiesPaginatedResult> => {
  const search = options.search?.trim() || "";
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(Math.max(1, options.limit ?? 12), 50);
  const sort = options.sort ?? "newest";
  const timeFilter = options.timeFilter ?? "all";
  const offset = (page - 1) * limit;

  let whereClause = "c.deleted_at IS NULL";
  const bind: (string | number)[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause += ` AND (c.name ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`;
    bind.push(`%${search}%`);
    paramIndex++;
  }

  if (timeFilter !== "all") {
    const now = new Date();
    let from: Date;
    if (timeFilter === "last_week") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeFilter === "last_month") {
      from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    }
    whereClause += ` AND c.created_at >= $${paramIndex}`;
    bind.push(from.toISOString());
    paramIndex++;
  }

  const orderBy =
    sort === "oldest"
      ? "c.created_at ASC"
      : sort === "most_members"
        ? "member_count DESC, c.created_at DESC"
        : sort === "least_members"
          ? "member_count ASC, c.created_at DESC"
          : "c.created_at DESC";

  const bindCount = [...bind];
  const countResult = await sequelize.query(
    `SELECT COUNT(*)::INTEGER as cnt
     FROM communities c
     WHERE ${whereClause}`,
    { bind: bindCount, type: QueryTypes.SELECT }
  ) as any[];
  const totalCount = countResult[0]?.cnt ?? 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  bind.push(limit, offset);
  const limitParam = paramIndex;
  const offsetParam = paramIndex + 1;

  const rows = await sequelize.query(
    `SELECT 
       c.id,
       c.name,
       c.description,
       c.image,
       c.created_by,
       c.created_at,
       COALESCE(mc.cnt::INTEGER, 0) as member_count,
       COALESCE(pc.cnt::INTEGER, 0) as posts_count
     FROM communities c
     LEFT JOIN (
       SELECT community_id, COUNT(*) as cnt
       FROM community_members
       WHERE deleted_at IS NULL
       GROUP BY community_id
     ) mc ON mc.community_id = c.id
     LEFT JOIN (
       SELECT community_id, COUNT(*) as cnt
       FROM community_posts
       WHERE deleted_at IS NULL
       GROUP BY community_id
     ) pc ON pc.community_id = c.id
     WHERE ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    { bind, type: QueryTypes.SELECT }
  ) as any[];

  const communityIds = rows.map((r) => r.id);
  let memberSet: Set<string> = new Set();
  if (options.userId && communityIds.length > 0) {
    const members = await sequelize.query(
      `SELECT community_id FROM community_members
       WHERE user_id = $1 AND deleted_at IS NULL
       AND community_id IN (SELECT unnest($2::uuid[]))`,
      { bind: [options.userId, communityIds], type: QueryTypes.SELECT }
    ) as any[];
    memberSet = new Set((members || []).map((m) => m.community_id));
  }

  const communities = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    image: r.image,
    created_by: r.created_by,
    member_count: r.member_count,
    is_member: memberSet.has(r.id),
    posts_count: r.posts_count ?? 0,
    created_at: r.created_at,
  }));

  return { communities, totalCount, totalPages, page, limit };
};

export const getCommunityByIdService = async (
  communityId: string,
  userId?: string
): Promise<Community | null> => {
  const [row] = await sequelize.query(
    `SELECT 
       c.id,
       c.name,
       c.description,
       c.image,
       c.created_by,
       c.created_at,
       COALESCE(mc.cnt::INTEGER, 0) as member_count
     FROM communities c
     LEFT JOIN (
       SELECT community_id, COUNT(*) as cnt
       FROM community_members
       WHERE deleted_at IS NULL
       GROUP BY community_id
     ) mc ON mc.community_id = c.id
     WHERE c.id = $1 AND c.deleted_at IS NULL
     LIMIT 1`,
    { bind: [communityId], type: QueryTypes.SELECT }
  ) as any[];

  if (!row) return null;

  let is_member = false;
  let role: 'ADMIN' | 'MEMBER' | undefined;
  if (userId) {
    const [member] = await sequelize.query(
      `SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
      { bind: [communityId, userId], type: QueryTypes.SELECT }
    ) as any[];
    if (member) {
      is_member = true;
      role = member.role;
    }
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image: row.image,
    created_by: row.created_by,
    member_count: row.member_count,
    is_member,
    role,
    created_at: row.created_at,
  };
};

export const updateCommunityService = async (
  userId: string,
  communityId: string,
  data: { name?: string; description?: string | null; image?: string | null }
): Promise<Community> => {
  const [member] = await sequelize.query(
    `SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    { bind: [communityId, userId], type: QueryTypes.SELECT }
  ) as any[];

  if (!member || member.role !== 'ADMIN') {
    throw { statusCode: 403, message: 'Only community admins can update the community' };
  }

  const [community] = await sequelize.query(
    `SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    { bind: [communityId], type: QueryTypes.SELECT }
  ) as any[];

  if (!community) throw { statusCode: 404, message: 'Community not found' };

  const updates: string[] = [];
  const bind: (string | null)[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    bind.push(data.name.trim());
    paramIndex++;
  }
  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    bind.push(data.description?.trim() || null);
    paramIndex++;
  }
  if (data.image !== undefined) {
    updates.push(`image = $${paramIndex}`);
    bind.push(data.image || null);
    paramIndex++;
  }

  if (updates.length === 0) {
    const updated = await getCommunityByIdService(communityId, userId);
    if (!updated) throw { statusCode: 404, message: 'Community not found' };
    return updated;
  }

  bind.push(communityId);
  await sequelize.query(
    `UPDATE communities SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
    { bind, type: QueryTypes.UPDATE }
  );

  const updated = await getCommunityByIdService(communityId, userId);
  if (!updated) throw { statusCode: 404, message: 'Community not found' };
  return updated;
};

export const deleteCommunityService = async (
  userId: string,
  communityId: string
): Promise<void> => {
  const [member] = await sequelize.query(
    `SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    { bind: [communityId, userId], type: QueryTypes.SELECT }
  ) as any[];

  if (!member || member.role !== 'ADMIN') {
    throw { statusCode: 403, message: 'Only community admins can delete the community' };
  }

  await sequelize.query(
    `UPDATE communities SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    { bind: [communityId], type: QueryTypes.UPDATE }
  );
};

export const getCommunityMembersService = async (
  communityId: string,
  limit = 50
): Promise<CommunityMember[]> => {
  const rows = await sequelize.query(
    `SELECT 
       cm.id,
       cm.user_id,
       cm.community_id,
       cm.role,
       cm.joined_at,
       u.username,
       COALESCE(o.image, u.image) as image,
       COALESCE(u.is_verified_email, false) as is_verified
     FROM community_members cm
     INNER JOIN users u ON u.id = cm.user_id AND u.deleted_at IS NULL
     LEFT JOIN onboarding o ON o.user_id = u.id AND o.deleted_at IS NULL
     WHERE cm.community_id = $1 AND cm.deleted_at IS NULL
     ORDER BY (cm.role = 'ADMIN') DESC, cm.joined_at ASC
     LIMIT $2`,
    { bind: [communityId, limit], type: QueryTypes.SELECT }
  ) as any[];

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    community_id: r.community_id,
    role: r.role,
    username: r.username,
    image: r.image,
    is_verified: r.is_verified,
    joined_at: r.joined_at,
  }));
};

export const joinCommunityService = async (
  userId: string,
  communityId: string
): Promise<void> => {
  const [community] = await sequelize.query(
    `SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    { bind: [communityId], type: QueryTypes.SELECT }
  ) as any[];

  if (!community) throw { statusCode: 404, message: "Community not found" };

  const [existing] = await sequelize.query(
    `SELECT id FROM community_members WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    { bind: [communityId, userId], type: QueryTypes.SELECT }
  ) as any[];

  if (existing) throw { statusCode: 409, message: "Already a member" };

  await sequelize.query(
    `INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
    { bind: [communityId, userId], type: QueryTypes.INSERT }
  );
};

export const addCommunityMemberService = async (
  adminUserId: string,
  communityId: string,
  targetUserId: string
): Promise<void> => {
  const [adminMember] = await sequelize.query(
    `SELECT role
     FROM community_members
     WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [communityId, adminUserId], type: QueryTypes.SELECT }
  ) as any[];
  if (!adminMember || adminMember.role !== "ADMIN") {
    throw { statusCode: 403, message: "Only community admins can add members" };
  }

  const [community] = await sequelize.query(
    `SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    { bind: [communityId], type: QueryTypes.SELECT }
  ) as any[];
  if (!community) throw { statusCode: 404, message: "Community not found" };

  const [targetUser] = await sequelize.query(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    { bind: [targetUserId], type: QueryTypes.SELECT }
  ) as any[];
  if (!targetUser) throw { statusCode: 404, message: "User not found" };

  const [existing] = await sequelize.query(
    `SELECT id
     FROM community_members
     WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [communityId, targetUserId], type: QueryTypes.SELECT }
  ) as any[];
  if (existing) throw { statusCode: 409, message: "User is already a member" };

  await sequelize.query(
    `INSERT INTO community_members (community_id, user_id, role)
     VALUES ($1, $2, 'MEMBER')`,
    { bind: [communityId, targetUserId], type: QueryTypes.INSERT }
  );
};

export const leaveCommunityService = async (
  userId: string,
  communityId: string
): Promise<void> => {
  const [member] = await sequelize.query(
    `SELECT id, role FROM community_members WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    { bind: [communityId, userId], type: QueryTypes.SELECT }
  ) as any[];

  if (!member) throw { statusCode: 404, message: "Not a member of this community" };

  // If admin, check if last admin
  if (member.role === "ADMIN") {
    const [adminCount] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM community_members WHERE community_id = $1 AND role = 'ADMIN' AND deleted_at IS NULL`,
      { bind: [communityId], type: QueryTypes.SELECT }
    ) as any[];
    if (parseInt(adminCount?.cnt || "0", 10) <= 1) {
      throw { statusCode: 400, message: "Cannot leave: assign another admin first or delete the community" };
    }
  }

  await sequelize.query(
    `UPDATE community_members SET deleted_at = NOW() WHERE community_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    { bind: [communityId, userId], type: QueryTypes.UPDATE }
  );
};
