

export type Contract = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string | null;
  weeklyHours: number;
};

export type Absence = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  type: 'General Absence' | 'Sick Leave' | 'In Office' | 'Home Office';
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: "Employee" | "Team Lead" | "Super Admin";
  avatar: string;
  reportsTo?: string; // User ID of manager
  teamId?: string;
  associatedProjectIds?: string[];
  contract: { // This is now a single object representing the primary contract for simplified access
    startDate: string;
    endDate: string | null;
    weeklyHours: number;
  },
  contracts: Omit<Contract, 'userId'>[];
  contractPdf?: string | null;
};

export type TimeEntry = {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  task: string;
  duration: number; // in hours
  placeOfWork: 'Home Office' | 'In Office';
  remarks?: string;
};

export type HolidayRequest = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: "Pending" | "Approved" | "Rejected";
  actionByUserId?: string | null;
  actionTimestamp?: string | null;
};

export type Project = {
  id: string;
  name: string;
  taskIds?: string[];
  budget?: number;
  hoursPerYear?: number;
  details?: string;
};

export type Task = {
  id: string;
  name: string;
  details?: string;
};

export type Team = {
  id: string;
  name: string;
  projectIds?: string[];
};

export type PublicHoliday = {
  id: string;
  country: string;
  name: string;
  date: string; // ISO string for simplicity
  type: "Full Day" | "Half Day";
};

export type CustomHoliday = {
  id: string;
  country: string;
  name: string;
  date: string; // ISO string
  type: "Full Day" | "Half Day";
  appliesTo: string; // 'all-teams', 'all-members', or a teamId
};

export type FreezeRule = {
  id: string;
  teamId: string; // 'all-teams' or a specific team id
  startDate: string;
  endDate: string;
  recurringDay?: number | null; // e.g., 0 for Sunday, 1 for Monday
};

export type PushMessage = {
  id: string;
  context: string;
  messageBody: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  receivers: 'all-members' | 'all-teams' | string[]; // Array of team IDs if not all
};

export type UserMessageState = {
  readMessageIds: string[];
};

export type AppNotification = {
  id: string;
  type: 'holidayRequest';
  recipientIds: string[];
  readBy: string[]; // array of userIds who have read it
  timestamp: string;
  title: string;
  body: string;
  referenceId: string; // holidayRequest id
};


export type LogEntry = {
  id:string;
  timestamp: string; // ISO string
  message: string;
};

export type ContractEndNotification = {
    id: string;
    teamIds: string[];
    recipientUserIds: string[];
    recipientEmails: string[];
    thresholdDays: number[];
};

export type InitialData = {
  teamMembers: Omit<User, 'contract' | 'contracts'>[];
  contracts: Omit<Contract, 'userId'>[];
  timeEntries: TimeEntry[];
  holidayRequests: HolidayRequest[];
  projects: Project[];
  tasks: Task[];
  teams: Team[];
  publicHolidays: PublicHoliday[];
  customHolidays: CustomHoliday[];
  freezeRules: FreezeRule[];
  pushMessages: PushMessage[];
  userMessageStates: Record<string, UserMessageState>;
  notifications: AppNotification[];
  systemLogs: LogEntry[];
  annualLeaveAllowance: number;
  absences: Absence[];
};
