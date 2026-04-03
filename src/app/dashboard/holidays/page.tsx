'use client';

import * as React from 'react';
import { PlusCircle, Check, X, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type User, type HolidayRequest } from "@/lib/mock-data";
import { format, differenceInCalendarDays, addDays, isSameDay, startOfYear, endOfYear, max, min, formatDistanceToNowStrict, parseISO, isWithinInterval, getYear } from "date-fns";
import { cn } from "@/lib/utils";
import { useHolidays } from '../contexts/HolidaysContext';
import { useMembers } from '../contexts/MembersContext';
import { useToast } from '@/hooks/use-toast';
import { RequestHolidayDialog } from './components/request-holiday-dialog';
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
  const { holidayRequests, approveRequest, rejectRequest } = useHolidays();
  const { teamMembers } = useMembers();
  const { currentUser } = useAuth();

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

  const getDurationInDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return differenceInCalendarDays(end, start) + 1;
  };
  
  const handleApprove = (requestId: string) => {
    approveRequest(requestId);
    toast({ title: "Request Approved", description: "The holiday request has been approved." });
  };
  
  const handleReject = (requestId: string) => {
    rejectRequest(requestId);
    toast({ title: "Request Rejected", description: "The holiday request has been rejected.", variant: 'destructive' });
  };

  return (
     <Card>
      <CardHeader>
        <CardTitle>Team Holiday Requests</CardTitle>
        <CardDescription>Review and manage holiday requests from your team.</CardDescription>
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
                                {format(new Date(req.startDate), 'PP')} - {format(new Date(req.endDate), 'PP')}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                                {getDurationInDays(req.startDate, req.endDate)} days
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
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No pending holiday requests.
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
                                    {format(new Date(req.startDate), 'PP')} - {format(new Date(req.endDate), 'PP')}
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
                                <TableCell colSpan={4} className="h-24 text-center">
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

    for (let dt = new Date(startDate); dt <= new Date(endDate); dt = addDays(dt, 1)) {
        const dayOfWeek = dt.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const isPublic = publicHolidays.some(h => isSameDay(new Date(h.date), dt));
        if (isPublic) continue;

        const isCustom = customHolidays.some(h => {
            const applies = (h.appliesTo === 'all-members') ||
                            (h.appliesTo === 'all-teams' && !!user.teamId) ||
                            (h.appliesTo === user.teamId);
            return applies && isSameDay(new Date(h.date), dt);
        });
        if (isCustom) continue;
        
        workdays++;
    }
    return workdays;
  }, [publicHolidays, customHolidays, teamMembers]);

  const getProratedAllowance = React.useCallback((user: User) => {
    const today = new Date();
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

  const takenDays = userHolidayRequests
    .filter(req => req.status === 'Approved')
    .reduce((acc, req) => acc + calculateDurationInWorkdays(new Date(req.startDate), new Date(req.endDate), req.userId), 0);

  const remainingDays = userAllowance - takenDays;

  const getDurationText = (days: number) => {
      const formattedDays = parseFloat(days.toFixed(2));
      return formattedDays === 1 ? '1 day' : `${formattedDays} days`;
  }
  
  const handleSaveRequest = (data: { date: { from: Date; to: Date } }) => {
    if (data.date.from && data.date.to) {
        const requestedDuration = calculateDurationInWorkdays(data.date.from, data.date.to, currentUser.id);
        
        if (requestedDuration <= 0) {
            toast({
                variant: 'destructive',
                title: 'Invalid Leave Dates',
                description: 'Your request does not contain any working days. Please select a different date range.',
            });
            return;
        }

        if (requestedDuration > remainingDays) {
            toast({
                variant: 'destructive',
                title: 'Insufficient Leave Allowance',
                description: `You are requesting ${requestedDuration} days but only have ${remainingDays.toFixed(2)} days remaining.`,
            });
            return;
        }

        addHolidayRequest({
            startDate: data.date.from.toISOString(),
            endDate: data.date.to.toISOString(),
        });
        setIsRequestDialogOpen(false);
    }
  };

  const handleWithdrawRequest = (requestId: string) => {
    withdrawRequest(requestId);
    setWithdrawingRequest(null);
    toast({
        title: "Request Withdrawn",
        description: "Your holiday request has been successfully withdrawn.",
    });
  }

  const currentYear = new Date().getFullYear();

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold font-headline">Holidays</h1>
            <p className="text-muted-foreground">Manage your holiday requests and allowance.</p>
          </div>
          <Button onClick={() => setIsRequestDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Request Holiday
          </Button>
        </div>
        
        <Tabs defaultValue="my-requests" className="space-y-4">
            <TabsList className={`grid w-full ${canViewTeamRequests ? 'grid-cols-2 md:w-[400px]' : 'grid-cols-1 w-[200px]'}`}>
                <TabsTrigger value="my-requests">My Requests</TabsTrigger>
                {canViewTeamRequests && <TabsTrigger value="team-requests">Team Requests</TabsTrigger>}
            </TabsList>
            <TabsContent value="my-requests">
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Total Allowance in {currentYear}</CardTitle>
                            <CardDescription>Based on your contract days this year</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold">{getDurationText(userAllowance)}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Taken in {currentYear}</CardTitle>
                            <CardDescription>Approved leave requests</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold">{getDurationText(takenDays)}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Remaining in {currentYear}</CardTitle>
                            <CardDescription>Available leave days</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold">{getDurationText(remainingDays)}</p>
                        </CardContent>
                    </Card>
                </div>
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>My Requests</CardTitle>
                        <CardDescription>A list of your submitted holiday requests.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Dates</TableHead>
                                    <TableHead className="hidden sm:table-cell">Duration</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {userHolidayRequests.map(req => (
                                    <TableRow key={req.id}>
                                    <TableCell className="font-medium">
                                        {format(new Date(req.startDate), 'LLL dd, y')} - {format(new Date(req.endDate), 'LLL dd, y')}
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                        {getDurationText(calculateDurationInWorkdays(new Date(req.startDate), new Date(req.endDate), req.userId))}
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
      <RequestHolidayDialog 
        isOpen={isRequestDialogOpen}
        onOpenChange={setIsRequestDialogOpen}
        onSave={handleSaveRequest}
      />
      <AlertDialog open={!!withdrawingRequest} onOpenChange={(isOpen) => !isOpen && setWithdrawingRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will withdraw your holiday request. This action cannot be undone.
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
