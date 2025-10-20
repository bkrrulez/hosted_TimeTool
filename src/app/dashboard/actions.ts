

'use server';

import { db } from '@/lib/db';
import { sendContractEndNotifications, sendHolidayRequestUpdateEmail, sendPasswordResetConfirmationEmail } from '@/lib/mail';
import {
  type User,
  type TimeEntry,
  type HolidayRequest,
  type Project,
  type Task,
  type Team,
  type PublicHoliday,
  type CustomHoliday,
  type FreezeRule,
  type PushMessage,
  type UserMessageState,
  type AppNotification,
  type LogEntry,
  type Contract,
  type ContractEndNotification,
  type Absence,
} from '@/lib/types';
import { format, subYears, isWithinInterval, addDays, differenceInDays, parse, getYear, startOfToday, parseISO, isAfter, isBefore } from 'date-fns';
import { revalidatePath } from 'next/cache';

// ========== Mappers ==========
// Map DB rows to application types

const mapDbUserToUser = (dbUser: any): User => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allContracts = (dbUser.contracts || []).map((c: any) => ({
        id: c.id,
        startDate: format(new Date(c.start_date), 'yyyy-MM-dd'),
        endDate: c.end_date ? format(new Date(c.end_date), 'yyyy-MM-dd') : null,
        weeklyHours: c.weekly_hours,
    }));

    const activeContracts = allContracts.filter((c: any) => {
        const startDate = new Date(c.startDate);
        const endDate = c.endDate ? new Date(c.endDate) : new Date('9999-12-31');
        return isWithinInterval(today, { start: startDate, end: endDate });
    });

    let primaryContract;
    if (activeContracts.length > 0) {
        primaryContract = activeContracts.sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
    } else {
        const sortedContracts = allContracts.sort((a: any, b: any) => {
            if (!a.endDate) return -1; // null end dates (ongoing) come first
            if (!b.endDate) return 1;
            return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
        });
        primaryContract = sortedContracts[0] || { startDate: new Date().toISOString(), endDate: null, weeklyHours: 0 };
    }
    
    return {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        avatar: dbUser.avatar,
        reportsTo: dbUser.reports_to,
        teamId: dbUser.team_id,
        associatedProjectIds: dbUser.associated_project_ids || [],
        contract: {
            startDate: primaryContract.startDate,
            endDate: primaryContract.endDate,
            weeklyHours: primaryContract.weeklyHours,
        },
        contracts: allContracts,
        contractPdf: dbUser.contract_pdf,
    };
};

const mapDbContractToContract = (dbContract: any): Contract => ({
    id: dbContract.id,
    userId: dbContract.user_id,
    startDate: format(new Date(dbContract.start_date), 'yyyy-MM-dd'),
    endDate: dbContract.end_date ? format(new Date(dbContract.end_date), 'yyyy-MM-dd') : null,
    weeklyHours: dbContract.weekly_hours
});

const mapDbProjectToProject = (dbProject: any): Project => ({
  id: dbProject.id,
  name: dbProject.name,
  budget: dbProject.budget ? Number(dbProject.budget) : undefined,
  hoursPerYear: dbProject.hours_per_year ? Number(dbProject.hours_per_year) : undefined,
  details: dbProject.details,
  taskIds: dbProject.task_ids || [],
});

const mapDbTaskToTask = (dbTask: any): Task => ({
  id: dbTask.id,
  name: dbTask.name,
  details: dbTask.details,
});

const mapDbTeamToTeam = (dbTeam: any): Team => ({
    id: dbTeam.id,
    name: dbTeam.name,
    projectIds: dbTeam.project_ids || [],
});

const mapDbHolidayRequestToHolidayRequest = (row: any): HolidayRequest => ({
  id: row.id,
  userId: row.user_id,
  startDate: format(new Date(row.start_date), 'yyyy-MM-dd'),
  endDate: format(new Date(row.end_date), 'yyyy-MM-dd'),
  status: row.status,
  actionByUserId: row.action_by_user_id,
  actionTimestamp: row.action_timestamp ? new Date(row.action_timestamp).toISOString() : null,
});

const mapDbContractEndNotification = (row: any): ContractEndNotification => ({
    id: row.id,
    teamIds: row.team_ids,
    recipientUserIds: row.recipient_user_ids,
    recipientEmails: row.recipient_emails,
    thresholdDays: row.threshold_days.map(Number) // Ensure numbers
});

const mapDbAbsence = (row: any): Absence => ({
    id: row.id,
    userId: row.user_id,
    startDate: format(new Date(row.start_date), 'yyyy-MM-dd'),
    endDate: format(new Date(row.end_date), 'yyyy-MM-dd'),
    type: row.type,
});

// ========== Users & Auth ==========

export async function verifyUserCredentials(email: string, password_input: string): Promise<User | null> {
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;

    // Special case for Super Admin login via environment variables
    if (email === adminEmail) {
        if (password_input === adminPassword) {
            const result = await db.query(`
                SELECT u.*, 
                (
                    SELECT json_agg(c.* ORDER BY c.end_date DESC NULLS FIRST, c.start_date DESC)
                    FROM contracts c
                    WHERE c.user_id = u.id
                ) as contracts,
                COALESCE(array_agg(DISTINCT up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') as associated_project_ids
                FROM users u
                LEFT JOIN user_projects up ON u.id = up.user_id
                WHERE u.email = $1
                GROUP BY u.id
            `, [email]);

            if (result.rows.length > 0) {
                return mapDbUserToUser(result.rows[0]);
            }
            return null; 
        } else {
            return null; // Incorrect password for admin
        }
    }

    // Standard user login
    const result = await db.query(`
        SELECT u.*, 
        (
            SELECT json_agg(c.* ORDER BY c.end_date DESC NULLS FIRST, c.start_date DESC)
            FROM contracts c
            WHERE c.user_id = u.id
        ) as contracts,
        COALESCE(array_agg(DISTINCT up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') as associated_project_ids
        FROM users u
        LEFT JOIN user_projects up ON u.id = up.user_id
        WHERE u.email = $1 AND u.password = $2
        GROUP BY u.id
    `, [email, password_input]);

    if (result.rows.length > 0) {
        return mapDbUserToUser(result.rows[0]);
    }
    
    return null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
    const result = await db.query(`
        SELECT u.*,
        (
            SELECT json_agg(c.* ORDER BY c.end_date DESC NULLS FIRST, c.start_date DESC)
            FROM contracts c
            WHERE c.user_id = u.id
        ) as contracts,
        COALESCE(array_agg(DISTINCT up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') as associated_project_ids
        FROM users u
        LEFT JOIN user_projects up ON u.id = up.user_id
        WHERE u.email = $1
        GROUP BY u.id
    `, [email]);
    if (result.rows.length > 0) {
        return mapDbUserToUser(result.rows[0]);
    }
    return null;
}

export async function getUsers(): Promise<User[]> {
    const result = await db.query(`
        SELECT 
            u.*, 
            COALESCE(array_agg(DISTINCT up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') as associated_project_ids,
            (
                SELECT json_agg(c.* ORDER BY c.end_date DESC NULLS FIRST, c.start_date DESC)
                FROM contracts c 
                WHERE c.user_id = u.id
            ) as contracts
        FROM users u
        LEFT JOIN user_projects up ON u.id = up.user_id
        GROUP BY u.id
        ORDER BY u.name
    `);
    return result.rows.map(mapDbUserToUser);
}


export async function addUser(newUserData: Omit<User, 'id' | 'avatar' >): Promise<User | null> {
    const { name, email, role, reportsTo, teamId, associatedProjectIds, contracts } = newUserData;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const id = `user-${Date.now()}`;
        const password = 'password';
        const avatar = `https://placehold.co/100x100.png`;

        const insertedUserRes = await client.query(
            `INSERT INTO users (id, name, email, password, role, avatar, reports_to, team_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [id, name, email, password, role, avatar, reportsTo, teamId]
        );
        
        let insertedContracts = [];
        if (contracts && contracts.length > 0) {
            for (const contract of contracts) {
                const contractId = `contract-${Date.now()}-${Math.random()}`;
                const contractRes = await client.query(
                    `INSERT INTO contracts (id, user_id, start_date, end_date, weekly_hours) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                    [contractId, id, contract.startDate, contract.endDate, contract.weeklyHours]
                );
                insertedContracts.push(contractRes.rows[0]);
            }
        }


        if (associatedProjectIds && associatedProjectIds.length > 0) {
            for (const projectId of associatedProjectIds) {
                await client.query('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [id, projectId]);
            }
        }
        await client.query('COMMIT');
        
        revalidatePath('/dashboard/settings/members');
        revalidatePath('/dashboard/team');

        const newUserQuery = await db.query(`
            SELECT 
                u.*, 
                COALESCE(array_agg(up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') as associated_project_ids,
                (SELECT json_agg(c.*) FROM contracts c WHERE c.user_id = u.id) as contracts
            FROM users u
            LEFT JOIN user_projects up ON u.id = up.user_id
            WHERE u.id = $1
            GROUP BY u.id
        `, [id]);

        return mapDbUserToUser(newUserQuery.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding user:', error);
        return null;
    } finally {
        client.release();
    }
}

export async function updateUser(updatedUser: User): Promise<User | null> {
    const { id, name, email, role, reportsTo, teamId, associatedProjectIds, contracts, avatar, contractPdf } = updatedUser;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        // Update the users table
        await client.query(
            `UPDATE users SET
                name = $1, email = $2, role = $3, reports_to = $4, team_id = $5,
                avatar = $6, contract_pdf = $7
             WHERE id = $8`,
            [name, email, role, reportsTo, teamId, avatar, contractPdf, id]
        );
        
        // --- Full Contract Synchronization ---
        const existingContractsRes = await client.query('SELECT id FROM contracts WHERE user_id = $1', [id]);
        const existingContractIds = new Set(existingContractsRes.rows.map(r => r.id));
        const updatedContractIds = new Set(contracts.map(c => c.id).filter(Boolean));

        // 1. Delete contracts that are no longer in the list
        const contractsToDelete = [...existingContractIds].filter(cid => !updatedContractIds.has(cid));
        if (contractsToDelete.length > 0) {
            await client.query('DELETE FROM contracts WHERE id = ANY($1::text[])', [contractsToDelete]);
        }
        
        // 2. Update existing contracts and insert new ones
        for (const contract of contracts) {
            if (contract.id && existingContractIds.has(contract.id)) {
                // Update existing contract
                await client.query(
                    `UPDATE contracts SET start_date = $1, end_date = $2, weekly_hours = $3 WHERE id = $4`,
                    [contract.startDate, contract.endDate || null, contract.weeklyHours, contract.id]
                );
            } else {
                 // Insert new contract
                 const contractId = `contract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                 await client.query(
                    `INSERT INTO contracts (id, user_id, start_date, end_date, weekly_hours) VALUES ($1, $2, $3, $4, $5)`,
                    [contractId, id, contract.startDate, contract.endDate || null, contract.weeklyHours]
                );
            }
        }
        // --- End of Contract Synchronization ---

        // Update project associations
        await client.query('DELETE FROM user_projects WHERE user_id = $1', [id]);
        if (associatedProjectIds && associatedProjectIds.length > 0) {
            for (const projectId of associatedProjectIds) {
                await client.query('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [id, projectId]);
            }
        }
        
        await client.query('COMMIT');
        
        revalidatePath('/dashboard/settings/members');
        revalidatePath('/dashboard/team');
        revalidatePath('/dashboard/profile');
        revalidatePath('/dashboard/contracts');
        
        // Refetch the user with all updated relations to return the latest state
        const finalUserQuery = await db.query(`
            SELECT 
                u.*, 
                COALESCE(array_agg(up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') as associated_project_ids,
                (SELECT json_agg(c.*) FROM contracts c WHERE c.user_id = u.id) as contracts
            FROM users u
            LEFT JOIN user_projects up ON u.id = up.user_id
            WHERE u.id = $1
            GROUP BY u.id
        `, [id]);
        
        if (finalUserQuery.rows.length === 0) return null;

        return mapDbUserToUser(finalUserQuery.rows[0]);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating user:', error);
        return null;
    } finally {
        client.release();
    }
}

export async function uploadUserContract(userId: string, contractPdfDataUri: string): Promise<void> {
    await db.query('UPDATE users SET contract_pdf = $1 WHERE id = $2', [contractPdfDataUri, userId]);
    revalidatePath('/dashboard/settings/members');
}

export async function deleteUserContract(userId: string): Promise<void> {
    await db.query('UPDATE users SET contract_pdf = NULL WHERE id = $1', [userId]);
    revalidatePath('/dashboard/settings/members');
}


export async function deleteUser(userId: string): Promise<void> {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Set reports_to to NULL for users who reported to the deleted user
        await client.query('UPDATE users SET reports_to = NULL WHERE reports_to = $1', [userId]);

        // Delete associated records in other tables to maintain referential integrity
        await client.query('DELETE FROM contracts WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM time_entries WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM holiday_requests WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM user_projects WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM notification_recipients WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM notification_read_by WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM push_message_read_by WHERE user_id = $1', [userId]);
        
        // Finally, delete the user from the users table
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        
        await client.query('COMMIT');
        
        revalidatePath('/dashboard/settings/members');
        revalidatePath('/dashboard/team');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting user:', error);
        throw new Error('Failed to delete user.');
    } finally {
        client.release();
    }
}

export async function updateUserPasswordAndNotify({ email, name, password }: { email: string; name: string, password: string}): Promise<void> {
    await db.query('UPDATE users SET password = $1 WHERE email = $2', [password, email]);
    await sendPasswordResetConfirmationEmail({ user: { name, email } as User, teamLead: null });
}


export async function resetUserPassword(email: string, newPassword: string): Promise<{user: User, teamLead: User | null} | null> {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const userResult = await client.query('UPDATE users SET password = $1 WHERE email = $2 RETURNING *', [newPassword, email]);
        
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return null; // User not found
        }
        
        const updatedDbUser = userResult.rows[0];
        const updatedUser = mapDbUserToUser(updatedDbUser);

        let teamLead: User | null = null;
        if (updatedUser.reportsTo) {
            const teamLeadResult = await client.query('SELECT * FROM users WHERE id = $1', [updatedUser.reportsTo]);
            if(teamLeadResult.rows.length > 0) {
                teamLead = mapDbUserToUser(teamLeadResult.rows[0]);
            }
        }
        
        await client.query('COMMIT');
        
        return { user: updatedUser, teamLead };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error resetting user password:', error);
        return null;
    } finally {
        client.release();
    }
}


// ========== Time Tracking ==========

export async function getTimeEntries(): Promise<TimeEntry[]> {
    const result = await db.query(`
      SELECT te.*, p.name as project_name, t.name as task_name
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      JOIN tasks t ON te.task_id = t.id
      ORDER BY te.date DESC, te.start_time DESC
    `);
    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      date: format(new Date(row.date), 'yyyy-MM-dd'),
      startTime: row.start_time,
      endTime: row.end_time,
      task: `${row.project_name} - ${row.task_name}`,
      duration: Number(row.duration),
      placeOfWork: row.place_of_work,
      remarks: row.remarks
    }));
}

export async function logTime(entry: Omit<TimeEntry, 'id'|'duration'> & {projectId: string, taskId: string}): Promise<TimeEntry | null> {
    const { userId, date, startTime, endTime, projectId: projectName, taskId: taskName, placeOfWork, remarks } = entry;
    const client = await db.connect();
    try {
        const projectResult = await client.query('SELECT id FROM projects WHERE name = $1', [projectName]);
        const taskResult = await client.query('SELECT id FROM tasks WHERE name = $1', [taskName]);

        if (projectResult.rows.length === 0) throw new Error(`Project not found: ${projectName}`);
        if (taskResult.rows.length === 0) throw new Error(`Task not found: ${taskName}`);

        const projectId = projectResult.rows[0].id;
        const taskId = taskResult.rows[0].id;

        const start = new Date(`1970-01-01T${startTime}`);
        const end = new Date(`1970-01-01T${endTime}`);
        const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        const id = `te-${Date.now()}`;
        const result = await client.query(
            `INSERT INTO time_entries (id, user_id, project_id, task_id, date, start_time, end_time, duration, place_of_work, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [id, userId, projectId, taskId, date, startTime, endTime, duration, placeOfWork, remarks]
        );
        revalidatePath('/dashboard');
        
        const inserted = result.rows[0];
        return {
            id: inserted.id,
            userId: inserted.user_id,
            date: format(new Date(inserted.date), 'yyyy-MM-dd'),
            startTime: inserted.start_time,
            endTime: inserted.end_time,
            task: `${projectName} - ${taskName}`,
            duration: Number(inserted.duration),
            placeOfWork: inserted.place_of_work,
            remarks: inserted.remarks,
        };
    } catch (error) {
        console.error('Error logging time:', error);
        return null;
    } finally {
        client.release();
    }
}

export async function updateTimeEntry(entryId: string, entry: Omit<TimeEntry, 'id' | 'duration'> & { projectId: string; taskId: string }): Promise<TimeEntry | null> {
  const { userId, date, startTime, endTime, projectId: projectName, taskId: taskName, placeOfWork, remarks } = entry;
  const client = await db.connect();
  try {
    const projectResult = await client.query('SELECT id FROM projects WHERE name = $1', [projectName]);
    const taskResult = await client.query('SELECT id FROM tasks WHERE name = $1', [taskName]);

    if (projectResult.rows.length === 0) throw new Error(`Project not found: ${projectName}`);
    if (taskResult.rows.length === 0) throw new Error(`Task not found: ${taskName}`);

    const projectId = projectResult.rows[0].id;
    const taskId = taskResult.rows[0].id;

    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    const result = await client.query(
      `UPDATE time_entries 
       SET project_id = $1, task_id = $2, date = $3, start_time = $4, end_time = $5, duration = $6, place_of_work = $7, remarks = $8
       WHERE id = $9 RETURNING *`,
      [projectId, taskId, date, startTime, endTime, duration, placeOfWork, remarks, entryId]
    );
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/reports');

    const updated = result.rows[0];
    return {
      id: updated.id,
      userId: updated.user_id,
      date: format(new Date(updated.date), 'yyyy-MM-dd'),
      startTime: updated.start_time,
      endTime: updated.end_time,
      task: `${projectName} - ${taskName}`,
      duration: Number(updated.duration),
      placeOfWork: updated.place_of_work,
      remarks: updated.remarks,
    };
  } catch (error) {
    console.error('Error updating time entry:', error);
    return null;
  } finally {
    client.release();
  }
}

export async function deleteTimeEntry(entryId: string): Promise<void> {
    await db.query('DELETE FROM time_entries WHERE id = $1', [entryId]);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/reports');
}

// ========== Contracts ==========
export async function getContracts(): Promise<Contract[]> {
    const result = await db.query('SELECT * FROM contracts ORDER BY start_date DESC');
    return result.rows.map(mapDbContractToContract);
}


export async function addContract(contractData: Omit<Contract, 'id'>): Promise<void> {
    const { userId, startDate, endDate, weeklyHours } = contractData;
    const id = `contract-${Date.now()}`;
    await db.query(
        'INSERT INTO contracts (id, user_id, start_date, end_date, weekly_hours) VALUES ($1, $2, $3, $4, $5)',
        [id, userId, startDate, endDate, weeklyHours]
    );
    revalidatePath('/dashboard/contracts');
}

export async function updateContract(contractId: string, contractData: Omit<Contract, 'id'>): Promise<void> {
    const { userId, startDate, endDate, weeklyHours } = contractData;
    await db.query(
        'UPDATE contracts SET user_id = $1, start_date = $2, end_date = $3, weekly_hours = $4 WHERE id = $5',
        [userId, startDate, endDate, weeklyHours, contractId]
    );
    revalidatePath('/dashboard/contracts');
}

export async function deleteContract(contractId: string): Promise<void> {
    await db.query('DELETE FROM contracts WHERE id = $1', [contractId]);
    revalidatePath('/dashboard/contracts');
}

// ========== Contract End Notifications ==========
export async function getContractEndNotifications(): Promise<ContractEndNotification[]> {
    try {
        const result = await db.query('SELECT * FROM contract_end_notifications');
        return result.rows.map(mapDbContractEndNotification);
    } catch (error: any) {
        console.error('Error getting contract end notifications:', error);
        if (error.code === '42P01') { 
            console.warn('contract_end_notifications table not found. Returning empty array.');
            return [];
        }
        throw error;
    }
}

export async function addContractEndNotification(notificationData: Omit<ContractEndNotification, 'id'>): Promise<ContractEndNotification | null> {
    const { teamIds, recipientUserIds, recipientEmails, thresholdDays } = notificationData;
    const id = `cen-${Date.now()}`;
    try {
        const result = await db.query(
            `INSERT INTO contract_end_notifications (id, team_ids, recipient_user_ids, recipient_emails, threshold_days) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, teamIds, recipientUserIds || [], recipientEmails || [], thresholdDays]
        );
        revalidatePath('/dashboard/contracts');
        return mapDbContractEndNotification(result.rows[0]);
    } catch (error) {
        console.error("Failed to add contract end notification", error);
        return null;
    }
}

export async function updateContractEndNotification(id: string, notificationData: Omit<ContractEndNotification, 'id'>): Promise<ContractEndNotification | null> {
    const { teamIds, recipientUserIds, recipientEmails, thresholdDays } = notificationData;
    try {
        const result = await db.query(
            `UPDATE contract_end_notifications SET team_ids=$1, recipient_user_ids=$2, recipient_emails=$3, threshold_days=$4 WHERE id=$5 RETURNING *`,
            [teamIds, recipientUserIds || [], recipientEmails || [], thresholdDays, id]
        );
        revalidatePath('/dashboard/contracts');
        return mapDbContractEndNotification(result.rows[0]);
    } catch (error) {
        console.error("Failed to update contract end notification", error);
        return null;
    }
}

export async function deleteContractEndNotification(notificationId: string): Promise<void> {
    try {
        await db.query('DELETE FROM contract_end_notifications WHERE id = $1', [notificationId]);
        revalidatePath('/dashboard/contracts');
    } catch (error) {
        console.error("Failed to delete contract end notification", error);
    }
}

export async function sendContractEndNotificationsNow(isManualTrigger: boolean = true): Promise<number> {
    const now = new Date();
    const NOTIFICATION_HOUR = 10;
    
    // For automatic trigger, check if it's time to run
    if (!isManualTrigger) {
        const lastCheckTimeStr = await getSystemSetting('lastContractNotificationCheckTime');
        const lastCheckTime = lastCheckTimeStr ? new Date(lastCheckTimeStr) : new Date(0);
        const todayAtRunTime = startOfToday();
        todayAtRunTime.setHours(NOTIFICATION_HOUR);

        // Check if current time is past run time and if we haven't already run today
        if (now < todayAtRunTime || lastCheckTime >= todayAtRunTime) {
            return 0; // Not time to run yet or already ran today
        }
    }
    
    const allContracts = await getContracts();
    const allUsers = await getUsers();
    const rules = await getContractEndNotifications();
    
    const today = startOfToday();

    const usersToNotifyDetails: { user: User; daysUntilExpiry: number; rule: ContractEndNotification; contract: Contract }[] = [];
    const notifiedUserContractSet = new Set<string>();

    for (const rule of rules) {
        for (const contract of allContracts) {
            const user = allUsers.find(u => u.id === contract.userId);
            if (!user) continue;

            const isUserInRuleTeam = rule.teamIds.includes('all-teams') || (user.teamId && rule.teamIds.includes(user.teamId));
            if (!isUserInRuleTeam) continue;

            if (!contract.endDate) continue;
            
            const contractEndDate = new Date(contract.endDate);
            if (contractEndDate < today) continue;
            
            const daysUntilExpiry = differenceInDays(contractEndDate, today);
            
            const notificationKey = `${user.id}-${contract.id}`;
            if (notifiedUserContractSet.has(notificationKey)) continue;

            let shouldNotify = false;
            
            if (isManualTrigger) {
                // For manual trigger, check if contract expires WITHIN any threshold
                if (rule.thresholdDays.some(threshold => daysUntilExpiry <= threshold)) {
                    shouldNotify = true;
                }
            } else { // Automatic Trigger (daily job)
                // For automatic trigger, check if contract expires on EXACTLY a threshold day
                if (rule.thresholdDays.includes(daysUntilExpiry)) {
                    // Check if we've already sent a notification for this contract for this threshold or a higher one.
                    const sentNotifsRes = await db.query(
                        'SELECT 1 FROM sent_notifications WHERE contract_id = $1 AND threshold_day >= $2', 
                        [contract.id, daysUntilExpiry]
                    );
                    if (sentNotifsRes.rowCount === 0) {
                        shouldNotify = true;
                    }
                }
            }
            
            if (shouldNotify) {
                usersToNotifyDetails.push({ user, daysUntilExpiry, rule, contract });
                notifiedUserContractSet.add(notificationKey);
            }
        }
    }
    
    if (usersToNotifyDetails.length > 0) {
        await sendContractEndNotifications(usersToNotifyDetails, allUsers);
        // Only record sent notifications for automatic runs to avoid spamming on manual triggers
        if (!isManualTrigger) {
            for (const detail of usersToNotifyDetails) {
                 await db.query('INSERT INTO sent_notifications (contract_id, threshold_day, sent_at) VALUES ($1, $2, NOW())', [detail.contract.id, detail.daysUntilExpiry]);
            }
        }
    }
    
    const logMessage = `Contract end notifications run. Trigger: ${isManualTrigger ? 'Manual' : 'Automatic'}. Notifications sent for ${usersToNotifyDetails.length} users.`;
    
    // If any notifications were sent or if it's a manual trigger, log it.
    // For automatic trigger, only log if something happened or it's the first run of the day.
    if (usersToNotifyDetails.length > 0 || isManualTrigger) {
        await addSystemLog(logMessage);
    }

    // After a successful automatic run, update the timestamp
    if (!isManualTrigger) {
        await setSystemSetting('lastContractNotificationCheckTime', now.toISOString());
    }
    
    return usersToNotifyDetails.length;
}


// ========== Projects ==========

export async function getProjects(): Promise<Project[]> {
    const result = await db.query(`
        SELECT p.*, COALESCE(array_agg(pt.task_id) FILTER (WHERE pt.task_id IS NOT NULL), '{}') as task_ids
        FROM projects p
        LEFT JOIN project_tasks pt ON p.id = pt.project_id
        GROUP BY p.id
        ORDER BY p.name
    `);
    return result.rows.map(mapDbProjectToProject);
}

export async function addProject(projectData: Omit<Project, 'id'>): Promise<void> {
    const { name, budget, hoursPerYear, details, taskIds } = projectData;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const id = `proj-${Date.now()}`;
        await client.query(
            'INSERT INTO projects (id, name, budget, hours_per_year, details) VALUES ($1, $2, $3, $4, $5)',
            [id, name, budget, hoursPerYear, details]
        );
        if (taskIds && taskIds.length > 0) {
            for (const taskId of taskIds) {
                await client.query('INSERT INTO project_tasks (project_id, task_id) VALUES ($1, $2)', [id, taskId]);
            }
        }
        await client.query('COMMIT');
        revalidatePath('/dashboard/settings/projects');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding project:', error);
    } finally {
        client.release();
    }
}

export async function updateProject(projectId: string, data: Omit<Project, 'id'>): Promise<void> {
    const { name, budget, hoursPerYear, details, taskIds } = data;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'UPDATE projects SET name = $1, budget = $2, hours_per_year = $3, details = $4 WHERE id = $5',
            [name, budget, hoursPerYear, details, projectId]
        );
        await client.query('DELETE FROM project_tasks WHERE project_id = $1', [projectId]);
        if (taskIds && taskIds.length > 0) {
            for (const taskId of taskIds) {
                await client.query('INSERT INTO project_tasks (project_id, task_id) VALUES ($1, $2)', [projectId, taskId]);
            }
        }
        await client.query('COMMIT');
        revalidatePath('/dashboard/settings/projects');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating project:', error);
    } finally {
        client.release();
    }
}

export async function deleteProject(projectId: string): Promise<void> {
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    revalidatePath('/dashboard/settings/projects');
}

// ========== Tasks ==========

export async function getTasks(): Promise<Task[]> {
    const result = await db.query('SELECT * FROM tasks ORDER BY name');
    return result.rows.map(mapDbTaskToTask);
}

export async function addTask(taskData: Omit<Task, 'id'>): Promise<void> {
    const id = `task-${Date.now()}`;
    await db.query('INSERT INTO tasks (id, name, details) VALUES ($1, $2, $3)', [id, taskData.name, taskData.details]);
    revalidatePath('/dashboard/settings/tasks');
}

export async function updateTask(taskId: string, data: Omit<Task, 'id'>): Promise<void> {
    await db.query('UPDATE tasks SET name = $1, details = $2 WHERE id = $3', [data.name, data.details, taskId]);
    revalidatePath('/dashboard/settings/tasks');
}

export async function deleteTask(taskId: string): Promise<void> {
    await db.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    revalidatePath('/dashboard/settings/tasks');
}

// ========== Teams ==========

export async function getTeams(): Promise<Team[]> {
    const result = await db.query(`
        SELECT t.*, COALESCE(array_agg(tp.project_id) FILTER (WHERE tp.project_id IS NOT NULL), '{}') as project_ids
        FROM teams t
        LEFT JOIN team_projects tp ON t.id = tp.team_id
        GROUP BY t.id
        ORDER BY t.name
    `);
    return result.rows.map(mapDbTeamToTeam);
}

export async function addTeam(teamData: Omit<Team, 'id'>): Promise<void> {
    const { name, projectIds } = teamData;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const id = `team-${Date.now()}`;
        await client.query('INSERT INTO teams (id, name) VALUES ($1, $2)', [id, name]);

        if (projectIds && projectIds.length > 0) {
            for (const projectId of projectIds) {
                await client.query('INSERT INTO team_projects (team_id, project_id) VALUES ($1, $2)', [id, projectId]);
            }
        }
        await client.query('COMMIT');
        revalidatePath('/dashboard/settings/teams');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding team:', error);
    } finally {
        client.release();
    }
}

export async function updateTeam(teamId: string, teamData: Omit<Team, 'id'>): Promise<void> {
    const { name, projectIds } = teamData;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE teams SET name = $1 WHERE id = $2', [name, teamId]);
        await client.query('DELETE FROM team_projects WHERE team_id = $1', [teamId]);
        if (projectIds && projectIds.length > 0) {
            for (const projectId of projectIds) {
                await client.query('INSERT INTO team_projects (team_id, project_id) VALUES ($1, $2)', [teamId, projectId]);
            }
        }
        await client.query('COMMIT');
        revalidatePath('/dashboard/settings/teams');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating team:', error);
    } finally {
        client.release();
    }
}

export async function deleteTeam(teamId: string): Promise<void> {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Unassign users from the team
        await client.query('UPDATE users SET team_id = NULL WHERE team_id = $1', [teamId]);
        
        // Delete team's project associations
        await client.query('DELETE FROM team_projects WHERE team_id = $1', [teamId]);
        
        // Delete push message associations
        await client.query('DELETE FROM push_message_teams WHERE team_id = $1', [teamId]);

        // Delete the team itself
        await client.query('DELETE FROM teams WHERE id = $1', [teamId]);

        await client.query('COMMIT');
        
        revalidatePath('/dashboard/settings/teams');
        revalidatePath('/dashboard/settings/members');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting team:', error);
        throw new Error('Failed to delete team.');
    } finally {
        client.release();
    }
}

// ========== Holidays ==========

export async function getPublicHolidays(): Promise<PublicHoliday[]> {
    const result = await db.query('SELECT * FROM public_holidays ORDER BY date');
    return result.rows.map(row => ({ ...row, date: format(new Date(row.date), 'yyyy-MM-dd')}));
}

export async function addPublicHoliday(holidayData: Omit<PublicHoliday, 'id'>): Promise<PublicHoliday | null> {
    const { country, name, date, type } = holidayData;
    const id = `ph-${Date.now()}`;
    const result = await db.query(
        `INSERT INTO public_holidays (id, country, name, date, type) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, country, name, date, type]
    );
    revalidatePath('/dashboard/settings/holidays');
    const newHoliday = result.rows[0];
    return { ...newHoliday, date: format(new Date(newHoliday.date), 'yyyy-MM-dd') };
}

export async function updatePublicHoliday(holidayId: string, data: Omit<PublicHoliday, 'id'>): Promise<PublicHoliday | null> {
    const { country, name, date, type } = data;
    const result = await db.query(
        `UPDATE public_holidays SET country = $1, name = $2, date = $3, type = $4 WHERE id = $5 RETURNING *`,
        [country, name, date, type, holidayId]
    );
    revalidatePath('/dashboard/settings/holidays');
    const updatedHoliday = result.rows[0];
    return { ...updatedHoliday, date: format(new Date(updatedHoliday.date), 'yyyy-MM-dd') };
}

export async function deletePublicHoliday(holidayId: string): Promise<void> {
    await db.query('DELETE FROM public_holidays WHERE id = $1', [holidayId]);
    revalidatePath('/dashboard/settings/holidays');
}

export async function getCustomHolidays(): Promise<CustomHoliday[]> {
    const result = await db.query('SELECT * FROM custom_holidays ORDER BY date');
    return result.rows.map(row => ({ ...row, date: format(new Date(row.date), 'yyyy-MM-dd'), appliesTo: row.applies_to}));
}

export async function addCustomHoliday(holidayData: Omit<CustomHoliday, 'id'>): Promise<CustomHoliday | null> {
    const { country, name, date, type, appliesTo } = holidayData;
    const id = `ch-${Date.now()}`;
    const result = await db.query(
        `INSERT INTO custom_holidays (id, country, name, date, type, applies_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, country, name, date, type, appliesTo]
    );
    revalidatePath('/dashboard/settings/holidays');
    const newHoliday = result.rows[0];
    return { ...newHoliday, appliesTo: newHoliday.applies_to, date: format(new Date(newHoliday.date), 'yyyy-MM-dd') };
}

export async function updateCustomHoliday(holidayId: string, data: Omit<CustomHoliday, 'id'>): Promise<CustomHoliday | null> {
    const { country, name, date, type, appliesTo } = data;
    const result = await db.query(
        `UPDATE custom_holidays SET country = $1, name = $2, date = $3, type = $4, applies_to = $5 WHERE id = $6 RETURNING *`,
        [country, name, date, type, appliesTo, holidayId]
    );
    revalidatePath('/dashboard/settings/holidays');
    const updatedHoliday = result.rows[0];
    return { ...updatedHoliday, appliesTo: updatedHoliday.applies_to, date: format(new Date(updatedHoliday.date), 'yyyy-MM-dd') };
}

export async function deleteCustomHoliday(holidayId: string): Promise<void> {
    await db.query('DELETE FROM custom_holidays WHERE id = $1', [holidayId]);
    revalidatePath('/dashboard/settings/holidays');
}

export async function getHolidayRequests(): Promise<HolidayRequest[]> {
    const result = await db.query('SELECT * FROM holiday_requests ORDER BY start_date DESC');
    return result.rows.map(mapDbHolidayRequestToHolidayRequest);
}

export async function getAnnualLeaveAllowance(): Promise<number> {
    // This is not in the db schema, so we'll return a static value as before.
    // In a real app, this would be in a settings table.
    return 25;
}

export async function setAnnualLeaveAllowance(allowance: number): Promise<void> {
    // No DB table for this, so this is a no-op.
    console.log(`Annual leave allowance set to ${allowance} days (in-memory only).`);
}

export async function addHolidayRequest(request: Omit<HolidayRequest, 'id'>): Promise<HolidayRequest | null> {
    const id = `hr-${Date.now()}`;
    const result = await db.query(
        `INSERT INTO holiday_requests (id, user_id, start_date, end_date, status) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, request.userId, request.startDate, request.endDate, request.status]
    );
    revalidatePath('/dashboard/holidays');
    return mapDbHolidayRequestToHolidayRequest(result.rows[0]);
}

export async function updateHolidayRequestStatus(requestId: string, status: 'Approved' | 'Rejected', approverId: string): Promise<HolidayRequest | null> {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const updateResult = await client.query(
            `UPDATE holiday_requests SET status = $1, action_by_user_id = $2, action_timestamp = NOW() WHERE id = $3 AND status = $4 RETURNING *`,
            [status, approverId, requestId, 'Pending']
        );

        if (updateResult.rows.length === 0) {
            // Either request not found or it was not in 'Pending' state
            await client.query('ROLLBACK');
            return null;
        }
        
        const updatedRequest = mapDbHolidayRequestToHolidayRequest(updateResult.rows[0]);

        // Fetch users for email notification
        const requesterResult = await client.query('SELECT * FROM users WHERE id = $1', [updatedRequest.userId]);
        const approverResult = await client.query('SELECT * FROM users WHERE id = $1', [approverId]);

        if (requesterResult.rows.length === 0 || approverResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return null; // Should not happen
        }

        const requester = mapDbUserToUser(requesterResult.rows[0]);
        const approver = mapDbUserToUser(approverResult.rows[0]);
        
        let teamLead: User | null = null;
        if (requester.reportsTo) {
            const teamLeadResult = await client.query('SELECT * FROM users WHERE id = $1', [requester.reportsTo]);
            if(teamLeadResult.rows.length > 0) {
                teamLead = mapDbUserToUser(teamLeadResult.rows[0]);
            }
        }
        
        await sendHolidayRequestUpdateEmail({ request: updatedRequest, user: requester, approver, teamLead, status });

        await client.query('COMMIT');
        
        revalidatePath('/dashboard/holidays');
        revalidatePath('/dashboard'); // for notifications popover

        return updatedRequest;

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating holiday request:', error);
        return null;
    } finally {
        client.release();
    }
}


export async function deleteHolidayRequest(requestId: string): Promise<void> {
    await db.query('DELETE FROM holiday_requests WHERE id = $1', [requestId]);
    revalidatePath('/dashboard/holidays');
}

// ========== Roster / Absences ==========
export async function getAbsences(): Promise<Absence[]> {
    try {
        const result = await db.query('SELECT * FROM absences');
        return result.rows.map(mapDbAbsence);
    } catch (error: any) {
        if (error.code === '42P01') { // table does not exist
            console.warn('Absences table not found, returning empty array.');
            return [];
        }
        throw error;
    }
}

export async function addAbsence(absence: Omit<Absence, 'id'>): Promise<Absence | null> {
    const id = `abs-${Date.now()}`;
    const { userId, startDate, endDate, type } = absence;
    try {
        const result = await db.query(
            `INSERT INTO absences (id, user_id, start_date, end_date, type) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, userId, startDate, endDate, type]
        );
        revalidatePath('/dashboard/roster');
        return mapDbAbsence(result.rows[0]);
    } catch (error) {
        console.error("Failed to add absence", error);
        return null;
    }
}

export async function updateAbsence(absenceId: string, absence: Omit<Absence, 'id'>): Promise<Absence | null> {
    const { userId, startDate, endDate, type } = absence;
    try {
        const result = await db.query(
            `UPDATE absences SET user_id = $1, start_date = $2, end_date = $3, type = $4 WHERE id = $5 RETURNING *`,
            [userId, startDate, endDate, type, absenceId]
        );
        revalidatePath('/dashboard/roster');
        return mapDbAbsence(result.rows[0]);
    } catch (error) {
        console.error("Failed to update absence", error);
        return null;
    }
}

export async function deleteAbsencesInRange(userId: string, startDate: string, endDate: string): Promise<number> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      const overlappingAbsencesRes = await client.query(
        'SELECT * FROM absences WHERE user_id = $1 AND start_date <= $2 AND end_date >= $3',
        [userId, endDate, startDate]
      );
  
      let affectedRows = 0;
  
      for (const row of overlappingAbsencesRes.rows) {
        const absenceStart = format(new Date(row.start_date), 'yyyy-MM-dd');
        const absenceEnd = format(new Date(row.end_date), 'yyyy-MM-dd');

        // Case 1: Clear range completely covers the absence
        if (startDate <= absenceStart && endDate >= absenceEnd) {
          const res = await client.query('DELETE FROM absences WHERE id = $1', [row.id]);
          affectedRows += res.rowCount || 0;
        }
        // Case 2: Clear range is in the middle of the absence, splitting it
        else if (startDate > absenceStart && endDate < absenceEnd) {
          const newEnd1 = format(addDays(parse(startDate, 'yyyy-MM-dd', new Date()), -1), 'yyyy-MM-dd');
          const res1 = await client.query('UPDATE absences SET end_date = $1 WHERE id = $2', [newEnd1, row.id]);
          affectedRows += res1.rowCount || 0;
          
          const newStart2 = format(addDays(parse(endDate, 'yyyy-MM-dd', new Date()), 1), 'yyyy-MM-dd');
          const newId = `abs-${Date.now()}-${Math.random()}`;
          const res2 = await client.query(
            'INSERT INTO absences (id, user_id, start_date, end_date, type) VALUES ($1, $2, $3, $4, $5)',
            [newId, userId, newStart2, absenceEnd, row.type]
          );
          affectedRows += res2.rowCount || 0;
        }
        // Case 3: Clear range trims the end of the absence
        else if (startDate <= absenceEnd && startDate > absenceStart) {
          const newEndDate = format(addDays(parse(startDate, 'yyyy-MM-dd', new Date()), -1), 'yyyy-MM-dd');
          const res = await client.query('UPDATE absences SET end_date = $1 WHERE id = $2', [newEndDate, row.id]);
          affectedRows += res.rowCount || 0;
        }
        // Case 4: Clear range trims the start of the absence
        else if (endDate >= absenceStart && endDate < absenceEnd) {
          const newStartDate = format(addDays(parse(endDate, 'yyyy-MM-dd', new Date()), 1), 'yyyy-MM-dd');
          const res = await client.query('UPDATE absences SET start_date = $1 WHERE id = $2', [newStartDate, row.id]);
          affectedRows += res.rowCount || 0;
        }
      }
  
      await client.query('COMMIT');
      revalidatePath('/dashboard/roster');
      return affectedRows;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Failed to delete/modify absences", error);
      return 0;
    } finally {
      client.release();
    }
  }

// ========== Access Control ==========

export async function getFreezeRules(): Promise<FreezeRule[]> {
    const result = await db.query('SELECT * FROM freeze_rules ORDER BY start_date DESC');
    return result.rows.map(row => ({
        id: row.id,
        teamId: row.team_id,
        startDate: format(new Date(row.start_date), 'yyyy-MM-dd'),
        endDate: format(new Date(row.end_date), 'yyyy-MM-dd'),
        recurringDay: row.recurring_day
    }));
}

export async function addFreezeRule(newRuleData: Omit<FreezeRule, 'id'>): Promise<FreezeRule | null> {
    const { teamId, startDate, endDate, recurringDay } = newRuleData;
    const id = `freeze-${Date.now()}`;
    const result = await db.query(
        `INSERT INTO freeze_rules (id, team_id, start_date, end_date, recurring_day) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, teamId, startDate, endDate, recurringDay]
    );
    revalidatePath('/dashboard/settings/access-control');
    return {
        id: result.rows[0].id,
        teamId: result.rows[0].team_id,
        startDate: format(new Date(result.rows[0].start_date), 'yyyy-MM-dd'),
        endDate: format(new Date(result.rows[0].end_date), 'yyyy-MM-dd'),
        recurringDay: result.rows[0].recurring_day
    }
}

export async function removeFreezeRule(ruleId: string): Promise<void> {
    await db.query('DELETE FROM freeze_rules WHERE id = $1', [ruleId]);
    revalidatePath('/dashboard/settings/access-control');
}

// ========== Notifications & Messages ==========

export async function getNotifications(): Promise<AppNotification[]> {
    const result = await db.query(`
        SELECT 
            n.*, 
            COALESCE(array_agg(DISTINCT nr.user_id) FILTER (WHERE nr.user_id IS NOT NULL), '{}') as recipient_ids,
            COALESCE(array_agg(DISTINCT nrb.user_id) FILTER (WHERE nrb.user_id IS NOT NULL), '{}') as read_by
        FROM app_notifications n
        LEFT JOIN notification_recipients nr ON n.id = nr.notification_id
        LEFT JOIN notification_read_by nrb ON n.id = nrb.notification_id
        GROUP BY n.id
        ORDER BY n.timestamp DESC
    `);
    return result.rows.map(row => ({
        ...row,
        timestamp: new Date(row.timestamp).toISOString(),
        readBy: row.read_by,
        recipientIds: row.recipient_ids
    }));
}

export async function addNotification(notification: Omit<AppNotification, 'id' | 'timestamp' | 'readBy'>): Promise<AppNotification | null> {
    const { type, recipientIds, title, body, referenceId } = notification;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const id = `notif-${Date.now()}`;
        const timestamp = new Date().toISOString();
        
        const res = await client.query(
            `INSERT INTO app_notifications (id, type, timestamp, title, body, reference_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [id, type, timestamp, title, body, referenceId]
        );

        for (const userId of recipientIds) {
            await client.query('INSERT INTO notification_recipients (notification_id, user_id) VALUES ($1, $2)', [id, userId]);
        }
        
        await client.query('COMMIT');
        revalidatePath('/dashboard');

        const newNotif = res.rows[0];
        return {
            id: newNotif.id,
            type: newNotif.type,
            recipientIds: recipientIds,
            readBy: [],
            timestamp: newNotif.timestamp.toISOString(),
            title: newNotif.title,
            body: newNotif.body,
            referenceId: newNotif.reference_id,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding notification:', error);
        return null;
    } finally {
        client.release();
    }
}

export async function markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    // Use ON CONFLICT DO NOTHING to prevent duplicate entries
    await db.query('INSERT INTO notification_read_by (notification_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [notificationId, userId]);
    revalidatePath('/dashboard');
}

export async function getPushMessages(): Promise<PushMessage[]> {
    const result = await db.query(`
        SELECT 
            pm.*, 
            CASE 
                WHEN pm.receivers = 'individual-teams' THEN COALESCE(array_agg(pmt.team_id), '{}')
                ELSE NULL
            END as team_ids
        FROM push_messages pm
        LEFT JOIN push_message_teams pmt ON pm.id = pmt.push_message_id AND pm.receivers = 'individual-teams'
        GROUP BY pm.id
        ORDER BY pm.start_date DESC
    `);
    return result.rows.map(row => ({
        id: row.id,
        context: row.context,
        messageBody: row.message_body,
        startDate: new Date(row.start_date).toISOString(),
        endDate: new Date(row.end_date).toISOString(),
        receivers: row.receivers === 'individual-teams' ? row.team_ids : row.receivers,
    }));
}

export async function addPushMessage(messageData: Omit<PushMessage, 'id'>): Promise<void> {
    const { context, messageBody, startDate, endDate, receivers } = messageData;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const id = `msg-${Date.now()}`;
        const receiversType = Array.isArray(receivers) ? 'individual-teams' : receivers;
        
        await client.query('INSERT INTO push_messages (id, context, message_body, start_date, end_date, receivers) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, context, messageBody, startDate, endDate, receiversType]
        );

        if (Array.isArray(receivers)) {
            for (const teamId of receivers) {
                await client.query('INSERT INTO push_message_teams (push_message_id, team_id) VALUES ($1, $2)', [id, teamId]);
            }
        }
        await client.query('COMMIT');
        revalidatePath('/dashboard/settings/push-messages');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding push message:', error);
    } finally {
        client.release();
    }
}

export async function updatePushMessage(messageId: string, data: Omit<PushMessage, 'id'>): Promise<void> {
    const { context, messageBody, startDate, endDate, receivers } = data;
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const receiversType = Array.isArray(receivers) ? 'individual-teams' : receivers;
        
        await client.query('UPDATE push_messages SET context=$1, message_body=$2, start_date=$3, end_date=$4, receivers=$5 WHERE id=$6',
            [context, messageBody, startDate, endDate, receiversType, messageId]
        );
        
        await client.query('DELETE FROM push_message_teams WHERE push_message_id = $1', [messageId]);
        if (Array.isArray(receivers)) {
            for (const teamId of receivers) {
                await client.query('INSERT INTO push_message_teams (push_message_id, team_id) VALUES ($1, $2)', [messageId, teamId]);
            }
        }
        
        await client.query('COMMIT');
        revalidatePath('/dashboard/settings/push-messages');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating push message:', error);
    } finally {
        client.release();
    }
}

export async function deletePushMessage(messageId: string): Promise<void> {
    await db.query('DELETE FROM push_messages WHERE id = $1', [messageId]);
    revalidatePath('/dashboard/settings/push-messages');
}

export async function getUserMessageStates(): Promise<Record<string, UserMessageState>> {
    const result = await db.query('SELECT * FROM push_message_read_by');
    const states: Record<string, UserMessageState> = {};
    for (const row of result.rows) {
        if (!states[row.user_id]) {
            states[row.user_id] = { readMessageIds: [] };
        }
        states[row.user_id].readMessageIds.push(row.push_message_id);
    }
    return states;
}

export async function markMessageAsRead(userId: string, messageId: string): Promise<void> {
    await db.query('INSERT INTO push_message_read_by (push_message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [messageId, userId]);
    revalidatePath('/dashboard');
}

// ========== System Logs ==========

export async function getSystemLogs(): Promise<LogEntry[]> {
    const result = await db.query('SELECT * FROM system_logs ORDER BY timestamp DESC');
    return result.rows.map(row => ({
        id: row.id,
        timestamp: new Date(row.timestamp).toISOString(),
        message: row.message,
    }));
}

export async function addSystemLog(message: string): Promise<LogEntry | null> {
    const id = `log-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const result = await db.query(`INSERT INTO system_logs (id, timestamp, message) VALUES ($1, $2, $3) RETURNING *`, [id, timestamp, message]);
    revalidatePath('/dashboard/settings/system-logs');
    return {
        id: result.rows[0].id,
        timestamp: new Date(result.rows[0].timestamp).toISOString(),
        message: result.rows[0].message
    };
}

export async function purgeOldSystemLogs(): Promise<number> {
    const threeYearsAgo = subYears(new Date(), 3);
    const result = await db.query('DELETE FROM system_logs WHERE timestamp < $1', [threeYearsAgo]);
    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
        await addSystemLog(`System automatically purged ${deletedCount} log entries older than 3 years.`);
    }
    revalidatePath('/dashboard/settings/system-logs');
    return deletedCount;
}

// ========== Global Settings ==========
export async function getSystemSetting(key: string): Promise<string | null> {
    try {
        const result = await db.query(`SELECT value FROM system_settings WHERE key = $1`, [key]);
        if (result.rows.length > 0) {
            return result.rows[0].value;
        }
        return null;
    } catch (error) {
        console.error(`Failed to get setting for key '${key}', returning null:`, error);
        return null;
    }
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
    try {
        await db.query(
            `INSERT INTO system_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2`,
            [key, value]
        );
    } catch (error) {
        console.error(`Failed to set setting for key '${key}':`, error);
    }
}

    

      

    

    







