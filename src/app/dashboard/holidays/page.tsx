'use client';

import * as React from 'react';
import { PlusCircle, Check, X, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type User, type HolidayRequest } from "@/lib/types";
import { format, differenceInCalendarDays, addDays, isSameDay, startOfYear, endOfYear, formatDistanceToNowStrict, parseISO, isWithinInterval, getYear } from "date-fns";
import { cn } from "@/lib/utils";
import { useHolidays } from '../contexts/HolidaysContext';
import { useMembers } from '../contexts/MembersContext';
import { useToast } from '@/hooks/use-toast';
import { RequestLeavesDialog, type LeaveRequestFormValues } from './components/request-holiday-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '../contexts/AuthContext';


const getStatusVariant = (status: "Pending" | "Approved" | "Rejected"): "secondary" | "default" | "destructive" => {
    switch (status) {
        case "Approved":
            return "default";
        case "Pending":
            return "secondary";
        case "Rejected":
            return "destructive";
    }
};

function TeamRequestsTab() {
  const { toast } = useToast();
  const { holidayRequests, approveRequest, rejectRequest, publicHolidays, customHolidays } = useHolidays();
  const { teamMembers } = useMembers();
  const { currentUser } = useAuth();

  const calculateDurationInWorkdays = React.useCallback((startDate: Date, endDate: Date, userId: string): number => {
    let workdays = 0;
    const user = teamMembers.find(u => u.id === userId);
    if (!user) return 0;

    const current = new Date(startDate);
    const end = new Date(endDate);
    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const dateStr = format(current, 'yyyy-MM-dd');
            const isPublic = publicHolidays.some(h => format(parseISO(h.date), 'yyyy-MM-dd') === dateStr);
            const isCustom = customHolidays.some(h => {
                const applies = (h.appliesTo === 'all-members') ||
                                (h.appliesTo === 'all-teams' && !!user.teamId) ||
                                (h.appliesTo === user.teamId);
                return applies && format(parseISO(h.date), 'yyyy-MM-dd') === dateStr;
            });
            if (!isPublic && !isCustom) workdays++;
        }
        current.setDate(current.getDate() + 1);
    }
    return workdays;
  }, [publicHolidays, customHolidays, teamMembers]);

  const { pendingRequests, historyRequests } = React.useMemo(() => {
    const all = holidayRequests.filter(req => {
        if (currentUser.role === 'Super Admin') return true;
        if (currentUser.role === 'Team Lead') {
            const member = teamMembers.find(m => m.id === req.userId);
            return member?.reportsTo === currentUser.id;
        }
        return false;
    }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    
    const pending = all.filter(r => r.status === 'Pending');
    const history = all.filter(r => r.status !== 'Pending');

    return { pendingRequests: pending, historyRequests: history };
  }, [holidayRequests, teamMembers, currentUser]);


  const getMemberDetails = (userId: string) => {
    return teamMembers.find(m => m.id === userId);
  };

  const getDurationText = (days: number) => {
      const formattedDays = parseFloat(days.toFixed(2));
      return formattedDays === 1 ? '1 day' : `${formattedDays} days`;
  }
  
  const handleApprove = (requestId: string) => {
    approveRequest(requestId);
    toast({ title: "Request Approved", description: "The leave request has been approved." });
  };
  
  const handleReject = (requestId: string) => {
    rejectRequest(requestId);
    toast({ title: "Request Rejected", description: "The leave request has been rejected.", variant: 'destructive' });
  };

  return (
     <Card>
      <CardHeader>
        <CardTitle>Team Leave Requests</CardTitle>
        <CardDescription>Review and manage vacation and sick leave requests from your team.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="hidden sm:table-cell">Duration</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pendingRequests.length > 0 ? pendingRequests.map(req => {
                        const member = getMemberDetails(req.userId);
                        return (
                            <TableRow key={req.id}>
                            <TableCell>
                                {member ? (
                                <div className="flex items-center gap-3">
                                    <Avatar className="w-9 h-9">
                                        <AvatarImage src={member.avatar} alt={member.name} data-ai-hint="person avatar" />
                                        <AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-medium">{member.name}</p>
                                        <p className="text-xs text-muted-foreground">{member.email}</p>
                                    </div>
                                </div>
                                ) : (
                                'Unknown User'
                                )}
                            </TableCell>
                            <TableCell className="font-medium">
                                {format(parseISO(req.startDate), 'PP')} - {format(parseISO(req.endDate), 'PP')}
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline">{req.type}</Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                                {getDurationText(calculateDurationInWorkdays(parseISO(req.startDate), parseISO(req.endDate), req.userId))}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex gap-2 justify-end">
                                    <Button size="sm" onClick={() => handleApprove(req.id)}>
                                        <Check className="mr-2 h-4 w-4" /> Approve
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleReject(req.id)}>
                                        <X className="mr-2 h-4 w-4" /> Reject
                                    </Button>
                                </div>
                            </TableCell>
                            </TableRow>
                        );
                        }) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No pending leave requests.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TabsContent>
            <TabsContent value="history" className="mt-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Member</TableHead>
                            <TableHead>Dates</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Action By</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {historyRequests.length > 0 ? historyRequests.map(req => {
                            const member = getMemberDetails(req.userId);
                            const approver = req.actionByUserId ? getMemberDetails(req.actionByUserId) : null;
                            return (
                                <TableRow key={req.id}>
                                <TableCell>
                                    {member ? (
                                    <div className="flex items-center gap-3">
                                        <p className="font-medium">{member.name}</p>
                                    </div>
                                    ) : (
                                    'Unknown User'
                                    )}
                                </TableCell>
                                <TableCell className="font-medium">
                                    {format(parseISO(req.startDate), 'PP')} - {format(parseISO(req.endDate), 'PP')}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">{req.type}</Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={getStatusVariant(req.status)} className={cn(getStatusVariant(req.status) === 'default' && 'bg-green-600')}>{req.status}</Badge>
                                </TableCell>
                                 <TableCell>
                                     {approver ? (
                                        <div className="flex flex-col">
                                            <span>{approver.name}</span>
                                            {req.actionTimestamp && <span className="text-xs text-muted-foreground">{formatDistanceToNowStrict(new Date(req.actionTimestamp))} ago</span>}
                                        </div>
                                     ) : 'N/A'}
                                 </TableCell>
                                </TableRow>
                            )
                        }) : (
                             <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No historical requests found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function HolidaysPage() {
  const { annualLeaveAllowance, holidayRequests, addHolidayRequest, withdrawRequest, publicHolidays, customHolidays } = useHolidays();
  const { teamMembers } = useMembers();
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [isRequestDialogOpen, setIsRequestDialogOpen] = React.useState(false);
  const [withdrawingRequest, setWithdrawingRequest] = React.useState<HolidayRequest | null>(null);
  const canViewTeamRequests = currentUser.role === 'Super Admin' || currentUser.role === 'Team Lead';

  const calculateDurationInWorkdays = React.useCallback((startDate: Date, endDate: Date, userId: string): number => {
    let workdays = 0;
    const user = teamMembers.find(u => u.id === userId);
    if (!user) return 0;

    // Use a copy to avoid mutating inputs
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    // Normalize to midnight for comparison
    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const dateStr = format(current, 'yyyy-MM-dd');
            
            const isPublic = publicHolidays.some(h => format(parseISO(h.date), 'yyyy-MM-dd') === dateStr);
            const isCustom = customHolidays.some(h => {
                const applies = (h.appliesTo === 'all-members') ||
                                (h.appliesTo === 'all-teams' && !!user.teamId) ||
                                (h.appliesTo === user.teamId);
                return applies && format(parseISO(h.date), 'yyyy-MM-dd') === dateStr;
            });

            if (!isPublic && !isCustom) {
                workdays++;
            }
        }
        current.setDate(current.getDate() + 1);
    }
    return workdays;
  }, [publicHolidays, customHolidays, teamMembers]);

  const getProratedAllowance = React.useCallback((user: User) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const yearStart = startOfYear(today);
    const yearEnd = endOfYear(today);
    const daysInYear = differenceInCalendarDays(yearEnd, yearStart) + 1;

    let daysWithActiveContract = 0;
    for (let d = new Date(yearStart); d <= yearEnd; d = addDays(d, 1)) {
        const isCovered = user.contracts.some(c => {
            const contractStart = parseISO(c.startDate);
            const contractEnd = c.endDate ? parseISO(c.endDate) : new Date('9999-12-31');
            return isWithinInterval(d, { start: contractStart, end: contractEnd });
        });
        if (isCovered) daysWithActiveContract++;
    }

    return (annualLeaveAllowance / daysInYear) * daysWithActiveContract;
  }, [annualLeaveAllowance]);

  const userAllowance = getProratedAllowance(currentUser);
  const userHolidayRequests = holidayRequests.filter(req => req.userId === currentUser.id);

  const takenVacationDays = React.useMemo(() => {
      return userHolidayRequests
        .filter(req => req.status === 'Approved' && req.type === 'Vacation' && getYear(parseISO(req.startDate)) === getYear(new Date()))
        .reduce((acc, req) => acc + calculateDurationInWorkdays(parseISO(req.startDate), parseISO(req.endDate), req.userId), 0);
  }, [userHolidayRequests, calculateDurationInWorkdays]);

  const takenSickDays = React.useMemo(() => {
      return userHolidayRequests
        .filter(req => req.status === 'Approved' && req.type === 'Sick Leave' && getYear(parseISO(req.startDate)) === getYear(new Date()))
        .reduce((acc, req) => acc + calculateDurationInWorkdays(parseISO(req.startDate), parseISO(req.endDate), req.userId), 0);
  }, [userHolidayRequests, calculateDurationInWorkdays]);

  const remainingDays = Math.max(0, userAllowance - takenVacationDays);

  const getDurationText = (days: number) => {
      const formattedDays = parseFloat(days.toFixed(2));
      return formattedDays === 1 ? '1 day' : `${formattedDays} days`;
  }
  
  const handleSaveRequest = (data: LeaveRequestFormValues) => {
    if (data.from && data.to) {
        const targetUserId = data.userId || currentUser.id;
        // Standardize to local dates at midnight for workday calculation
        const start = new Date(data.from.getFullYear(), data.from.getMonth(), data.from.getDate());
        const end = new Date(data.to.getFullYear(), data.to.getMonth(), data.to.getDate());
        
        const requestedDuration = calculateDurationInWorkdays(start, end, targetUserId);
        
        if (requestedDuration <= 0) {
            toast({
                variant: 'destructive',
                title: 'Invalid Leave Dates',
                description: 'The request does not contain any working days. Please select a different date range.',
            });
            return;
        }

        addHolidayRequest({
            userId: data.userId,
            startDate: format(data.from, 'yyyy-MM-dd'),
            endDate: format(data.to, 'yyyy-MM-dd'),
            type: data.type,
        });
        setIsRequestDialogOpen(false);
    }
  };

  const handleWithdrawRequest = (requestId: string) => {
    withdrawRequest(requestId);
    setWithdrawingRequest(null);
    toast({
        title: "Request Withdrawn",
        description: "Your leave request has been successfully withdrawn.",
    });
  }

  const currentYear = new Date().getFullYear();

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold font-headline">Holidays</h1>
            <p className="text-muted-foreground">Manage leave requests and allowance.</p>
          </div>
          <Button onClick={() => setIsRequestDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Request Leaves
          </Button>
        </div>
        
        <Tabs defaultValue="my-requests" className="space-y-4">
            <TabsList className={`grid w-full ${canViewTeamRequests ? 'grid-cols-2 md:w-[400px]' : 'grid-cols-1 w-[200px]'}`}>
                <TabsTrigger value="my-requests">My Requests</TabsTrigger>
                {canViewTeamRequests && <TabsTrigger value="team-requests">Team Requests</TabsTrigger>}
            </TabsList>
            <TabsContent value="my-requests">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Total Allowance in {currentYear}</CardTitle>
                            <CardDescription>Based on contract days this year</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold">{getDurationText(userAllowance)}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Vacation Taken in {currentYear}</CardTitle>
                            <CardDescription>Approved vacation requests</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold">{getDurationText(takenVacationDays)}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Remaining in {currentYear}</CardTitle>
                            <CardDescription>Available vacation days</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold">{getDurationText(remainingDays)}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Sick Leaves in {currentYear}</CardTitle>
                            <CardDescription>Approved sick leave days</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold">{getDurationText(takenSickDays)}</p>
                        </CardContent>
                    </Card>
                </div>
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>My Requests</CardTitle>
                        <CardDescription>A list of your submitted leave requests.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Dates</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="hidden sm:table-cell">Duration</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {userHolidayRequests.map(req => (
                                    <TableRow key={req.id}>
                                    <TableCell className="font-medium">
                                        {format(parseISO(req.startDate), 'PP')} - {format(parseISO(req.endDate), 'PP')}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{req.type}</Badge>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                        {getDurationText(calculateDurationInWorkdays(parseISO(req.startDate), parseISO(req.endDate), req.userId))}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusVariant(req.status)} className={cn(getStatusVariant(req.status) === 'default' && 'bg-green-600')}>{req.status}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {req.status === 'Pending' && (
                                            <Button variant="outline" size="sm" onClick={() => setWithdrawingRequest(req)}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Withdraw
                                            </Button>
                                        )}
                                    </TableCell>
                                    </TableRow>
                                ))}
                                {userHolidayRequests.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">No leave requests found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
            {canViewTeamRequests && (
                <TabsContent value="team-requests">
                    <TeamRequestsTab />
                </TabsContent>
            )}
        </Tabs>
      </div>
      <RequestLeavesDialog 
        isOpen={isRequestDialogOpen}
        onOpenChange={setIsRequestDialogOpen}
        onSave={handleSaveRequest}
        currentUser={currentUser}
        teamMembers={teamMembers}
      />
      <AlertDialog open={!!withdrawingRequest} onOpenChange={(isOpen) => !isOpen && setWithdrawingRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will withdraw your leave request. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleWithdrawRequest(withdrawingRequest!.id)}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}