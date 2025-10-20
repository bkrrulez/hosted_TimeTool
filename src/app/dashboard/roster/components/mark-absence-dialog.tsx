
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { User, Absence } from '@/lib/types';
import { AbsenceType } from '../../contexts/RosterContext';

const absenceSchema = z.object({
  userId: z.string().min(1, 'Please select a member.'),
  date: z.object({
    from: z.date({ required_error: 'A start date is required.' }),
    to: z.date({ required_error: 'An end date is required.' }),
  }),
  type: z.enum(['General Absence', 'Sick Leave', 'Clear Absence/ Work']),
});

type AbsenceFormValues = z.infer<typeof absenceSchema>;

interface MarkAbsenceDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (from: Date, to: Date, type: AbsenceType, userId: string, absenceId?: string) => void;
  userId?: string;
  members?: User[];
  isTeamView?: boolean;
  absence?: Absence | null;
}

export function MarkAbsenceDialog({ isOpen, onOpenChange, onSave, userId, members, isTeamView = false, absence = null }: MarkAbsenceDialogProps) {
  const form = useForm<AbsenceFormValues>({
    resolver: zodResolver(absenceSchema),
    defaultValues: {
      userId: isTeamView ? '' : userId,
      date: { from: new Date(), to: new Date() },
      type: 'General Absence'
    },
  });

  const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false);
  const [tempDateRange, setTempDateRange] = React.useState<DateRange | undefined>();
  
  React.useEffect(() => {
    if (isOpen) {
        if (absence) {
            const fromDate = new Date(absence.startDate);
            const toDate = new Date(absence.endDate);
            form.reset({
                userId: absence.userId,
                date: { from: fromDate, to: toDate },
                type: absence.type
            });
            setTempDateRange({ from: fromDate, to: toDate });
        } else {
            const defaultDate = new Date();
            form.reset({
                userId: isTeamView ? '' : userId,
                date: { from: defaultDate, to: defaultDate },
                type: 'General Absence'
            });
            setTempDateRange({ from: defaultDate, to: defaultDate });
        }
    }
  }, [isOpen, absence, form, isTeamView, userId]);


  function onSubmit(data: AbsenceFormValues) {
    const targetUserId = isTeamView ? data.userId : userId;
    if (data.date.from && data.date.to && targetUserId) {
      onSave(data.date.from, data.date.to, data.type as AbsenceType, targetUserId, absence?.id);
    }
  }

  const handleDateSelect = (range: DateRange | undefined) => {
    if(range?.from && !range.to) {
        setTempDateRange({from: range.from, to: range.from});
    } else {
        setTempDateRange(range);
    }
  }
  
  const dialogTitle = isTeamView ? "Update Roster" : "Update My Roster";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Select a date range and absence type to mark on the roster.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {isTeamView && members && (
                 <FormField
                    control={form.control}
                    name="userId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Member</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!!absence}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a member" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {members.map(member => (
                                <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            )}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Absence/ Work Dates</FormLabel>
                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn("w-full justify-start text-left font-normal", !field.value?.from && "text-muted-foreground")}
                           onClick={() => {
                               setTempDateRange(field.value); // Sync temp state on open
                               setIsDatePickerOpen(true)
                           }}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value?.from ? (
                            field.value.to ? (
                              <>
                                {format(field.value.from, "LLL dd, y")} - {format(field.value.to, "LLL dd, y")}
                              </>
                            ) : (
                              format(field.value.from, "LLL dd, y")
                            )
                          ) : (
                            <span>Pick a date range</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                       <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={tempDateRange?.from}
                        selected={tempDateRange}
                        onSelect={handleDateSelect}
                        numberOfMonths={2}
                      />
                       <div className="p-2 border-t flex justify-end">
                            <Button size="sm" onClick={() => {
                                if (tempDateRange?.from) {
                                    field.onChange({
                                        from: tempDateRange.from,
                                        to: tempDateRange.to || tempDateRange.from,
                                    });
                                }
                                setIsDatePickerOpen(false);
                            }}>Ok</Button>
                        </div>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Absence/ Work Type</FormLabel>
                   <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an absence type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="General Absence">General Absence</SelectItem>
                        <SelectItem value="Sick Leave">Sick Leave</SelectItem>
                        <SelectItem value="Clear Absence/ Work">Clear Absence/ Work</SelectItem>
                      </SelectContent>
                    </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">Save Absence</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
