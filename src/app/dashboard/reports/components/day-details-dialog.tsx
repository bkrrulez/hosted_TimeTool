
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type TimeEntry, type User } from '@/lib/types';
import { format } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { useMembers } from '../../contexts/MembersContext';

interface DayDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  date: Date;
  entries: TimeEntry[];
  canEdit: boolean;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
}

export function DayDetailsDialog({ isOpen, onOpenChange, date, entries, canEdit, onEdit, onDelete }: DayDetailsDialogProps) {
  const { freezeRules } = useAccessControl();
  const { teamMembers } = useMembers();

  const isDateFrozenForUser = (userId: string, dateToCheck: Date) => {
    const user = teamMembers.find(m => m.id === userId);
    if (!user) return false;

    for (const rule of freezeRules) {
      const ruleAppliesToAll = rule.teamId === 'all-teams';
      const ruleAppliesToUserTeam = user.teamId && rule.teamId === user.teamId;

      if (ruleAppliesToAll || ruleAppliesToUserTeam) {
        const startDate = new Date(rule.startDate);
        const endDate = new Date(rule.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        if (dateToCheck >= startDate && dateToCheck <= endDate) {
          return true;
        }
      }
    }
    return false;
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Time Entries for {format(date, 'PPP')}</DialogTitle>
          <DialogDescription>
            A detailed breakdown of manually logged hours for this day.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Start Time</TableHead>
                        <TableHead>End Time</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Remarks</TableHead>
                        {canEdit && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {entries.length > 0 ? entries.map(entry => {
                        const [project, ...taskParts] = entry.task.split(' - ');
                        const task = taskParts.join(' - ');
                        const isFrozen = isDateFrozenForUser(entry.userId, new Date(entry.date));
                        
                        return (
                            <TableRow key={entry.id}>
                                <TableCell>{entry.startTime}</TableCell>
                                <TableCell>{entry.endTime}</TableCell>
                                <TableCell>{project || 'N/A'}</TableCell>
                                <TableCell>{task || 'N/A'}</TableCell>
                                <TableCell className="max-w-[200px] truncate">{entry.remarks || '-'}</TableCell>
                                {canEdit && (
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" disabled={isFrozen}>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(entry)} disabled={isFrozen}>
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onDelete(entry)} className="text-destructive focus:text-destructive" disabled={isFrozen}>
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                )}
                            </TableRow>
                        )
                    }) : (
                         <TableRow>
                            <TableCell colSpan={canEdit ? 6 : 5} className="h-24 text-center">No manual time entries for this day.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
