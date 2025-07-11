
"use client";

import Link from "next/link";
import {
  Bell,
  ChevronDown,
  Calendar as CalendarIcon,
  Home,
  LogOut,
  Users,
  Settings,
  BarChartHorizontal,
  ChevronRight,
  Briefcase,
  ClipboardList,
  CalendarDays,
  Send,
  Building,
  PlusCircle,
  Shield,
  ScrollText,
} from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LogoIcon } from "@/components/ui/logo-icon";
import { cn } from "@/lib/utils";
import { LogTimeDialog, type LogTimeFormValues } from "./components/log-time-dialog";
import { NotificationPopover } from "./components/notification-popover";
import { TimeTrackingProvider, useTimeTracking } from "./contexts/TimeTrackingContext";
import { MembersProvider } from "./contexts/MembersContext";
import { AccessControlProvider } from "./contexts/AccessControlContext";
import { ProjectsProvider } from "./contexts/ProjectsContext";
import { TasksProvider } from "./contexts/TasksContext";
import { HolidaysProvider } from "./contexts/HolidaysContext";
import { TeamsProvider } from "./contexts/TeamsContext";
import { PushMessagesProvider, usePushMessages } from "./contexts/PushMessagesContext";
import { SystemLogProvider } from "./contexts/SystemLogContext";
import { NotificationsProvider, useNotifications } from "./contexts/NotificationsContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SettingsProvider, useSettings } from "./contexts/SettingsContext";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const getStatus = (startDate: string, endDate: string) => {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now < start) return 'Scheduled';
  if (now > end) return 'Expired';
  return 'Active';
};

function LanguageToggle() {
    const { language, setLanguage } = useLanguage();

    const toggleLanguage = () => {
        const newLang = language === 'en' ? 'de' : 'en';
        setLanguage(newLang);
    };

    return (
        <div className="flex items-center space-x-2">
            <Label htmlFor="language-toggle" className="text-sm font-medium">EN</Label>
            <Switch
                id="language-toggle"
                checked={language === 'de'}
                onCheckedChange={toggleLanguage}
            />
            <Label htmlFor="language-toggle" className="text-sm font-medium">DE</Label>
        </div>
    );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, logout } = useAuth();
  const { logTime } = useTimeTracking();
  const { isHolidaysNavVisible } = useSettings();
  const { t } = useLanguage();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isLogTimeDialogOpen, setIsLogTimeDialogOpen] = React.useState(false);
  const [isNotificationPopoverOpen, setIsNotificationPopoverOpen] = React.useState(false);
  
  const { pushMessages, userMessageStates } = usePushMessages();
  const { notifications } = useNotifications();

  React.useEffect(() => {
    setIsSettingsOpen(pathname.startsWith('/dashboard/settings'));
  }, [pathname]);
  
  const activeUnreadPushCount = React.useMemo(() => {
    const userReadIds = userMessageStates[currentUser.id]?.readMessageIds || [];
    return pushMessages.filter(msg => {
      const isApplicable = msg.receivers === 'all-members' || 
                           (msg.receivers === 'all-teams' && currentUser.teamId) ||
                           (Array.isArray(msg.receivers) && currentUser.teamId && msg.receivers.includes(currentUser.teamId));
      
      return isApplicable && 
             getStatus(msg.startDate, msg.endDate) === 'Active' && 
             !userReadIds.includes(msg.id);
    }).length;
  }, [pushMessages, userMessageStates, currentUser]);

  const unreadRequestCount = React.useMemo(() => {
    return notifications.filter(n => n.recipientIds.includes(currentUser.id) && !n.readBy.includes(currentUser.id)).length;
  }, [notifications, currentUser]);

  const totalUnreadCount = activeUnreadPushCount + unreadRequestCount;
  
  const handleLogTime = (data: LogTimeFormValues, entryId?: string) => {
    // This dialog instance is only for CREATING new entries.
    // The individual report page will have its own instance for editing.
    if (entryId) {
      // This should not happen from the main layout's "Log Time" button.
      console.error("Attempted to edit an entry from the main log time dialog.");
      return Promise.resolve({ success: false });
    }
    return logTime(data, currentUser.id);
  };


  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Link href="/dashboard">
            <div className="flex items-center gap-2 p-2">
              <LogoIcon className="w-8 h-8" />
              <h1 className="text-xl font-bold font-headline text-primary">TimeTool</h1>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/dashboard"}>
                <Link href="/dashboard">
                  <Home />
                  {t('dashboard')}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/team")}>
                <Link href="/dashboard/team">
                  <Users />
                  {t('team')}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {(currentUser.role === 'Team Lead' || currentUser.role === 'Super Admin') && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/reports")}>
                  <Link href="/dashboard/reports">
                    <BarChartHorizontal />
                    {t('reports')}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {isHolidaysNavVisible && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/holidays")}>
                  <Link href="/dashboard/holidays">
                    <CalendarIcon />
                    {t('holidays')}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <Collapsible open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <SidebarMenuItem>
                    <CollapsibleTrigger className="w-full" asChild>
                        <SidebarMenuButton className="justify-between w-full">
                            <div className="flex items-center gap-2">
                                <Settings />
                                <span>{t('settings')}</span>
                            </div>
                            <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", isSettingsOpen && "rotate-90")} />
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                </SidebarMenuItem>
                <CollapsibleContent>
                    <SidebarMenu className="pl-6 py-2 space-y-1">
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/settings/members")}>
                            <Link href="/dashboard/settings/members">
                                <Users /> {t('members')}
                            </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/settings/teams")}>
                            <Link href="/dashboard/settings/teams">
                                <Building /> {t('teams')}
                            </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/settings/projects")}>
                            <Link href="/dashboard/settings/projects">
                                <Briefcase /> {t('projects')}
                            </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/settings/tasks")}>
                            <Link href="/dashboard/settings/tasks">
                                <ClipboardList /> {t('tasks')}
                            </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {(currentUser.role === 'Super Admin' || currentUser.role === 'Team Lead') && (
                        <SidebarMenuItem>
                          <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/settings/access-control")}>
                              <Link href="/dashboard/settings/access-control">
                                  <Shield /> {t('accessControl')}
                              </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {currentUser.role === 'Super Admin' && (
                        <>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/settings/holidays")}>
                                <Link href="/dashboard/settings/holidays">
                                    <CalendarDays /> {t('holidays')}
                                </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/settings/push-messages")}>
                                <Link href="/dashboard/settings/push-messages">
                                    <Send /> {t('pushMessages')}
                                </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                           <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={pathname.startsWith("/dashboard/settings/system-logs")}>
                                <Link href="/dashboard/settings/system-logs">
                                    <ScrollText /> {t('systemLogs')}
                                </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </>
                      )}
                    </SidebarMenu>
                </CollapsibleContent>
            </Collapsible>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout}>
                  <LogOut />
                  {t('logout')}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center justify-between p-4 bg-card border-b sticky top-0 z-10">
          <SidebarTrigger />
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <Button onClick={() => setIsLogTimeDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> {t('logTime')}
            </Button>
            <Popover open={isNotificationPopoverOpen} onOpenChange={setIsNotificationPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {totalUnreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                      {totalUnreadCount}
                    </span>
                  )}
                  <span className="sr-only">Notifications</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-0">
                <NotificationPopover onClose={() => setIsNotificationPopoverOpen(false)} />
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 p-1 h-auto">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={currentUser.avatar} alt={currentUser.name} data-ai-hint="person avatar"/>
                    <AvatarFallback>{currentUser.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-medium">{currentUser.name}</p>
                    <p className="text-xs text-muted-foreground">{currentUser.role}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('myAccount')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">{t('profile')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem>{t('support')}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>{t('logout')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 flex-1">{children}</main>
        <footer className="p-4 text-center text-xs text-muted-foreground">
          Created by Bikramjit Chowdhury
        </footer>
        <LogTimeDialog
          isOpen={isLogTimeDialogOpen}
          onOpenChange={setIsLogTimeDialogOpen}
          onSave={handleLogTime}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}


function DataProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider>
      <SystemLogProvider>
        <TeamsProvider>
          <ProjectsProvider>
            <TasksProvider>
              <MembersProvider>
                <NotificationsProvider>
                  <PushMessagesProvider>
                    <AuthProvider>
                      <SettingsProvider>
                        <HolidaysProvider>
                          <TimeTrackingProvider>
                            <AccessControlProvider>
                              <LayoutContent>{children}</LayoutContent>
                            </AccessControlProvider>
                          </TimeTrackingProvider>
                        </HolidaysProvider>
                      </SettingsProvider>
                    </AuthProvider>
                  </PushMessagesProvider>
                </NotificationsProvider>
              </MembersProvider>
            </TasksProvider>
          </ProjectsProvider>
        </TeamsProvider>
      </SystemLogProvider>
    </LanguageProvider>
  )
}


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DataProviders>
      {children}
    </DataProviders>
  );
}
