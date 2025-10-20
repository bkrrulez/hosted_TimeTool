
import type { InitialData } from './types';

export const initialData: InitialData = {
  teams: [
    { id: 'team-design', name: 'Design' },
    { id: 'team-eng', name: 'Engineering' },
  ],
  tasks: [
    { id: 'task-1', name: 'UI Design', details: 'Designing user interfaces for new features.' },
    { id: 'task-2', name: 'UX Research', details: 'Conducting user research and creating wireframes.' },
    { id: 'task-3', name: 'Frontend Development', details: 'Building the user interface with React.' },
    { id: 'task-4', name: 'Backend Development', details: 'Developing APIs and database logic.' },
    { id: 'task-5', name: 'Project Management', details: 'Planning and overseeing project progress.' },
  ],
  projects: [
    { id: 'proj-1', name: 'Website Redesign', budget: 50000, details: 'Complete overhaul of the company website.', taskIds: ['task-1', 'task-2', 'task-3', 'task-5'] },
    { id: 'proj-2', name: 'Mobile App', budget: 75000, details: 'New mobile application for iOS and Android.', taskIds: ['task-1', 'task-3', 'task-4', 'task-5'] },
    { id: 'proj-3', name: 'Internal CRM', budget: 30000, details: 'Customer relationship management tool for the sales team.', taskIds: ['task-3', 'task-4'] },
  ],
  teamMembers: [
    {
      id: 'user-admin',
      name: 'Admin Account',
      email: 'admin@example.com',
      role: 'Super Admin',
      avatar: 'https://placehold.co/100x100.png',
      associatedProjectIds: ['proj-1', 'proj-2', 'proj-3'],
      contracts: [], // Contracts will be added below
    },
    {
      id: 'user-lead',
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      role: 'Team Lead',
      avatar: 'https://placehold.co/100x100.png',
      reportsTo: 'user-admin',
      teamId: 'team-eng',
      associatedProjectIds: ['proj-2', 'proj-3'],
      contracts: [],
    },
    {
      id: 'user-1',
      name: 'John Smith',
      email: 'john.smith@example.com',
      role: 'Employee',
      avatar: 'https://placehold.co/100x100.png',
      reportsTo: 'user-lead',
      teamId: 'team-eng',
      associatedProjectIds: ['proj-2'],
      contracts: [],
    },
    {
      id: 'user-2',
      name: 'Emily White',
      email: 'emily.white@example.com',
      role: 'Employee',
      avatar: 'https://placehold.co/100x100.png',
      reportsTo: 'user-lead',
      teamId: 'team-eng',
      associatedProjectIds: ['proj-1'],
      contracts: [],
    },
  ],
  contracts: [
    { id: 'contract-admin-1', userId: 'user-admin', startDate: '2023-01-01', endDate: null, weeklyHours: 40 },
    { id: 'contract-lead-1', userId: 'user-lead', startDate: '2023-03-15', endDate: null, weeklyHours: 40 },
    { id: 'contract-user1-1', userId: 'user-1', startDate: '2023-05-20', endDate: null, weeklyHours: 40 },
    { id: 'contract-user2-1', userId: 'user-2', startDate: '2023-07-01', endDate: '2024-12-31', weeklyHours: 32 },
  ],
  timeEntries: [
    { id: 'te-1', userId: 'user-1', date: '2024-07-01', startTime: '09:00', endTime: '12:00', task: 'Mobile App - Backend Development', duration: 3, remarks: 'Worked on user auth API.' },
    { id: 'te-2', userId: 'user-1', date: '2024-07-01', startTime: '13:00', endTime: '17:00', task: 'Mobile App - Backend Development', duration: 4, remarks: 'Database schema design.' },
    { id: 'te-3', userId: 'user-2', date: '2024-07-02', startTime: '10:00', endTime: '16:00', task: 'Website Redesign - UI Design', duration: 5.5, remarks: 'Created new landing page mockups.' },
  ],
  holidayRequests: [
    { id: 'hr-1', userId: 'user-1', startDate: '2024-08-05', endDate: '2024-08-09', status: 'Approved' },
    { id: 'hr-2', userId: 'user-2', startDate: '2024-09-02', endDate: '2024-09-02', status: 'Pending' },
  ],
  publicHolidays: [
    { id: 'ph-1', country: 'USA', name: 'Independence Day', date: '2024-07-04', type: 'Full Day' },
    { id: 'ph-2', country: 'USA', name: 'Labor Day', date: '2024-09-02', type: 'Full Day' },
  ],
  customHolidays: [
      { id: 'ch-1', country: 'Global', name: 'Company Anniversary', date: '2024-10-10', type: 'Full Day', appliesTo: 'all-members'},
  ],
  freezeRules: [],
  pushMessages: [
    {
      id: 'msg-1',
      context: 'Welcome!',
      messageBody: 'Welcome to the new TimeTool platform!',
      startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString(),
      endDate: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString(),
      receivers: 'all-members'
    }
  ],
  userMessageStates: {},
  notifications: [],
  systemLogs: [
    { id: 'log-1', timestamp: new Date().toISOString(), message: 'System initialized.'}
  ],
  annualLeaveAllowance: 25,
  absences: [],
};
