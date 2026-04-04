
'use client';

import * as React from 'react';
import { format, min as minDate, max as maxDate, isWithinInterval, startOfDay, isAfter, parseISO } from "date-fns";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type User } from "@/lib/types";
import { EditMemberDialog, type EditMemberFormValues } from "./edit-contract-dialog";
import { useToast } from "@/hooks/use-toast";
import { ChangePasswordDialog } from "./change-password-dialog";
import { updateUserPasswordAndNotify } from "@/app/dashboard/actions";
import { useMembers } from "../../contexts/MembersContext";
import { useTeams } from "../../contexts/TeamsContext";
import { useAuth } from "../../contexts/AuthContext";
import { useSystemLog } from '../../contexts/SystemLogContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';

interface TeamMembersProps {
    onAddMemberClick: () => void;
    onExportClick: (members: User[]) => void;
}

export function TeamMembers({ onAddMemberClick, onExportClick }: TeamMembersProps) {
    const { toast } = useToast();
    const { teamMembers, updateMember } = useMembers();
    const { teams } = useTeams();
    const { currentUser } = useAuth();
    const { logAction } = useSystemLog();
    const { t } = useLanguage();
    const [editingUser, setEditingUser] = React.useState<User | null>(null);
    const [changingPasswordUser, setChangingPasswordUser] = React.useState<User | null>(null);
    const [isSavingPassword, setIsSavingPassword] = React.useState(false);
    const [selectedTeams, setSelectedTeams] = React.useState<string[]>(['all']);
    const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>(['all-status']);
    
    const teamOptions = React.useMemo(() => {
        return [
            { value: 'all', label: 'All Teams' },
            { value: 'none', label: 'No Team' },
            ...teams.map(team => ({ value: team.id, label: team.name }))
        ];
    }, [teams]);

    const statusOptions: MultiSelectOption[] = [
        { value: 'all-status', label: 'All Status' },
        { value: 'Upcoming', label: 'Upcoming' },
        { value: 'Active', label: 'Active' },
        { value: 'Expired', label: 'Expired' },
    ];

    const handleTeamSelectionChange = (newSelection: string[]) => {
      if (newSelection.length === 0) {
        setSelectedTeams(['all']);
        return;
      }
      if (newSelection.length > 1 && newSelection[newSelection.length - 1] === 'all') {
        setSelectedTeams(['all']);
      } 
      else if (newSelection.length > 1 && newSelection.includes('all')) {
        setSelectedTeams(newSelection.filter(s => s !== 'all'));
      } 
      else {
        setSelectedTeams(newSelection);
      }
    };

    const handleStatusSelectionChange = (newSelection: string[]) => {
      if (newSelection.length === 0) {
        setSelectedStatuses(['all-status']);
        return;
      }
      if (newSelection.length > 1 && newSelection[newSelection.length - 1] === 'all-status') {
        setSelectedStatuses(['all-status']);
      } 
      else if (newSelection.length > 1 && newSelection.includes('all-status')) {
        setSelectedStatuses(newSelection.filter(s => s !== 'all-status'));
      } 
      else {
        setSelectedStatuses(newSelection);
      }
    };

    const getMemberStatus = (member: User): string => {
        const today = startOfDay(new Date());
        const contracts = member.contracts || [];
        
        if (contracts.length === 0) return 'Expired';

        const hasActive = contracts.some(c => {
            const start = parseISO(c.startDate);
            const end = c.endDate ? parseISO(c.endDate) : new Date('9999-12-31');
            return isWithinInterval(today, { start, end });
        });

        if (hasActive) return 'Active';

        const hasUpcoming = contracts.some(c => isAfter(parseISO(c.startDate), today));
        if (hasUpcoming) return 'Upcoming';

        return 'Expired';
    };

    const visibleMembers = React.useMemo(() => {
        let members: User[];
        if (currentUser.role === 'Super Admin') {
            members = teamMembers;
        } else if (currentUser.role === 'Team Lead') {
            members = teamMembers.filter(member => member.id === currentUser.id || member.reportsTo === currentUser.id);
        } else { // Employee
            members = teamMembers.filter(member => member.id === currentUser.id);
        }

        if (!selectedTeams.includes('all')) {
             members = members.filter(member => {
                if (selectedTeams.length === 0) return true;
                let matches = false;
                if (selectedTeams.includes('none') && !member.teamId) {
                    matches = true;
                }
                if (member.teamId && selectedTeams.includes(member.teamId)) {
                    matches = true;
                }
                return matches;
            });
        }

        if (!selectedStatuses.includes('all-status')) {
            members = members.filter(member => {
                const status = getMemberStatus(member);
                return selectedStatuses.includes(status);
            });
        }
        
        const uniqueMembers = Array.from(new Map(members.map(item => [item.id, item])).values());
        
        uniqueMembers.sort((a, b) => {
            if (a.id === currentUser.id) return -1;
            if (b.id === currentUser.id) return 1;
            return a.name.localeCompare(b.name);
        });
        
        return uniqueMembers;
    }, [teamMembers, currentUser, selectedTeams, selectedStatuses]);
    
    const handleSaveDetails = async (originalUser: User, updatedData: EditMemberFormValues) => {
        if (!editingUser) return;
        await updateMember(originalUser, updatedData);
        setEditingUser(null);
        toast({
            title: t('memberDetailsUpdated'),
            description: t('memberDetailsUpdatedDesc', { name: updatedData.name }),
        });
        await logAction(`User '${currentUser.name}' updated details for member '${updatedData.name}'.`);
    }

    const handlePasswordChange = async (password: string) => {
        if (!changingPasswordUser) return;

        setIsSavingPassword(true);
        try {
            await updateUserPasswordAndNotify({ email: changingPasswordUser.email, name: changingPasswordUser.name, password: password });
            toast({
                title: t('passwordChanged'),
                description: t('passwordChangedDesc', { name: changingPasswordUser.name }),
            });
            await logAction(`User '${currentUser.name}' changed password for '${changingPasswordUser.name}'.`);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: t('error'),
                description: t('smtpError'),
            });
        } finally {
            setIsSavingPassword(false);
            setChangingPasswordUser(null);
        }
    };

    const canEditMember = (member: User) => {
        if (currentUser.role === 'Super Admin') {
            return true;
        }
        if (currentUser.role === 'Team Lead') {
            return member.reportsTo === currentUser.id && member.role === 'Employee';
        }
        return false;
    };
    
    const canChangePassword = (member: User) => {
        if (currentUser.role === 'Super Admin') return true;
        if (currentUser.id === member.id) return true;
        if (currentUser.role === 'Team Lead' && member.reportsTo === currentUser.id) return true;
        return false;
    };

    const canDownloadContract = (member: User) => {
        if (!member.contractPdf) return false;
        if (currentUser.role === 'Super Admin') return true;
        if (currentUser.id === member.id) return true;
        if (currentUser.role === 'Team Lead' && member.reportsTo === currentUser.id) return true;
        return false;
    }

    const handleDownloadContract = (member: User) => {
        if (!member.contractPdf) return;
        const link = document.createElement('a');
        link.href = member.contractPdf;
        link.download = `contract-${member.name.replace(/\s+/g, '-')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getTeamName = (teamId?: string) => {
        if (!teamId) return 'N/A';
        const team = teams.find(t => t.id === teamId);
        return team?.name ?? 'N/A';
    };

    const getAggregatedContractDetails = (member: User) => {
        const now = new Date();
        const activeContracts = member.contracts.filter(c => {
            const start = new Date(c.startDate);
            const end = c.endDate ? new Date(c.endDate) : new Date('9999-12-31');
            return isWithinInterval(now, { start, end });
        });

        if (activeContracts.length === 0) {
            const sortedContracts = [...member.contracts].sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
            const mostRecent = sortedContracts[0] || member.contract;
            return {
                weeklyHours: mostRecent.weeklyHours,
                startDate: mostRecent.startDate,
                endDate: mostRecent.endDate
            };
        }

        const totalWeeklyHours = activeContracts.reduce((sum, c) => sum + c.weeklyHours, 0);
        const earliestStartDate = minDate(activeContracts.map(c => new Date(c.startDate)));
        
        const endDates = activeContracts.map(c => c.endDate ? new Date(c.endDate) : null).filter(Boolean);
        const latestEndDate = endDates.length > 0 ? maxDate(endDates as Date[]) : null;

        return {
            weeklyHours: totalWeeklyHours,
            startDate: format(earliestStartDate, 'yyyy-MM-dd'),
            endDate: latestEndDate ? format(latestEndDate, 'yyyy-MM-dd') : null,
        };
    };

  return (
    <>
      <Card>
          <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div>
                <CardTitle>{t('teamMembers')}</CardTitle>
                <CardDescription>{t('teamMembersTabDesc')}</CardDescription>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                 <MultiSelect
                    options={statusOptions}
                    selected={selectedStatuses}
                    onChange={handleStatusSelectionChange}
                    placeholder="Filter by status..."
                    className="w-full sm:w-[180px]"
                 />
                 <MultiSelect
                    options={teamOptions}
                    selected={selectedTeams}
                    onChange={handleTeamSelectionChange}
                    placeholder="Filter by team..."
                    className="w-full sm:w-[220px]"
                 />
              </div>
          </CardHeader>
          <CardContent>
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>{t('member')}</TableHead>
                          <TableHead className="hidden md:table-cell">{t('role')}</TableHead>
                          <TableHead className="hidden md:table-cell">{t('team')}</TableHead>
                          <TableHead className="hidden md:table-cell text-right">{t('weeklyHours')}</TableHead>
                          <TableHead className="hidden lg:table-cell">{t('contractStart')}</TableHead>
                          <TableHead className="hidden lg:table-cell">{t('contractEnd')}</TableHead>
                          <TableHead><span className="sr-only">{t('actions')}</span></TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {visibleMembers.map(member => {
                          const contractDetails = getAggregatedContractDetails(member);
                          return (
                          <TableRow key={member.id}>
                              <TableCell>
                                  <div className="flex items-center gap-3">
                                      <Avatar className="w-10 h-10">
                                          <AvatarImage src={member.avatar} alt={member.name} data-ai-hint="person avatar"/>
                                          <AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                      </Avatar>
                                      <div>
                                          <p className="font-medium">{member.name}</p>
                                          <p className="text-sm text-muted-foreground hidden sm:table-cell">{member.email}</p>
                                      </div>
                                  </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                  <Badge variant={member.role === 'Team Lead' || member.role === 'Super Admin' ? "default" : "secondary"}>{member.role}</Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">{getTeamName(member.teamId)}</TableCell>
                              <TableCell className="hidden md:table-cell text-right font-mono">{contractDetails.weeklyHours}h</TableCell>
                              <TableCell className="hidden lg:table-cell">{format(new Date(contractDetails.startDate), 'PP')}</TableCell>
                              <TableCell className="hidden lg:table-cell">{contractDetails.endDate ? format(new Date(contractDetails.endDate), 'PP') : 'Ongoing'}</TableCell>
                              <TableCell>
                                  <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                          <Button aria-haspopup="true" size="icon" variant="ghost">
                                              <MoreHorizontal className="h-4 w-4" />
                                              <span className="sr-only">{t('toggleMenu')}</span>
                                          </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                          <DropdownMenuLabel>{t('actions')}</DropdownMenuLabel>
                                          <DropdownMenuItem asChild>
                                            <Link href={`/dashboard/reports?tab=individual-report&userId=${member.id}`}>{t('viewReport')}</Link>
                                          </DropdownMenuItem>
                                          {canDownloadContract(member) && (
                                            <DropdownMenuItem onClick={() => handleDownloadContract(member)}>
                                                {t('downloadContract')}
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuItem 
                                            onClick={() => setEditingUser(member)}
                                            disabled={!canEditMember(member)}
                                          >
                                            {t('viewEditDetails')}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => setChangingPasswordUser(member)}
                                            disabled={!canChangePassword(member)}
                                          >
                                            {t('changePassword')}
                                          </DropdownMenuItem>
                                      </DropdownMenuContent>
                                  </DropdownMenu>
                              </TableCell>
                          </TableRow>
                      )})}
                      {visibleMembers.length === 0 && (
                          <TableRow>
                              <TableCell colSpan={7} className="h-24 text-center">{t('noMembersToDisplay')}</TableCell>
                          </TableRow>
                      )}
                  </TableBody>
              </Table>
          </CardContent>
        </Card>
        {editingUser && (
        <EditMemberDialog 
            user={editingUser}
            isOpen={!!editingUser}
            onOpenChange={(isOpen) => {
                if (!isOpen) {
                    setEditingUser(null);
                }
            }}
            onSave={(updatedData) => handleSaveDetails(editingUser, updatedData)}
            teamMembers={teamMembers}
        />
      )}
      <ChangePasswordDialog
        user={changingPasswordUser}
        isOpen={!!changingPasswordUser}
        onOpenChange={(isOpen) => {
            if (!isOpen) setChangingPasswordUser(null);
        }}
        onSave={handlePasswordChange}
        isSaving={isSavingPassword}
      />
    </>
  )
}
