
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
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { User, Absence } from '@/lib/types';
import { AbsenceType } from '../../contexts/RosterContext';

const absenceSchema = z.object({
  userId: z.string().min(1, 'Please select a member.'),
  type: z.enum(['General Absence', 'Sick Leave', 'Clear Absence/ Work', 'In Office', 'Home Office']),
  absenceSpan: z.enum(['One Time', 'Recurring']),
  oneTimeDate: z.object({
    from: z.date().optional(),
    to: z.date().optional(),
  }).optional(),
  recurringStartDate: z.date().optional(),
  recurringEndDate: z.date().optional(),
  daysOfWeek: z.array(z.string()).optional(),
}).refine(data => {
    if (data.absenceSpan === 'One Time') {
        return !!data.oneTimeDate?.from && !!data.oneTimeDate?.to;
    }
    return true;
}, {
    message: 'A date range is required for one-time absences.',
    path: ['oneTimeDate'],
}).refine(data => {
    if (data.absenceSpan === 'Recurring') {
        return !!data.recurringStartDate && !!data.recurringEndDate;
    }
    return true;
}, {
    message: 'Start and end dates are required for recurring absences.',
    path: ['recurringStartDate'],
}).refine(data => {
    if (data.absenceSpan === 'Recurring') {
        return data.daysOfWeek && data.daysOfWeek.length > 0;
    }
    return true;
}, {
    message: 'Please select at least one day of the week.',
    path: ['daysOfWeek'],
});

type AbsenceFormValues = z.infer<typeof absenceSchema>;

export type AbsenceSubmitData = {
    userId: string;
    type: AbsenceType;
    absenceSpan: 'One Time' | 'Recurring';
    oneTimeDate?: { from: Date; to: Date };
    recurringStartDate?: Date;
    recurringEndDate?: Date;
    daysOfWeek?: string[];
}

interface MarkAbsenceDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: AbsenceSubmitData) => void;
  userId?: string;
  members?: User[];
  isTeamView?: boolean;
  absence?: Absence | null;
}

const daysOfWeekOptions = [
    { id: 'Mon', label: 'Mon' },
    { id: 'Tue', label: 'Tue' },
    { id: 'Wed', label: 'Wed' },
    { id: 'Thu', label: 'Thu' },
    { id: 'Fri', label: 'Fri' },
];

export function MarkAbsenceDialog({ isOpen, onOpenChange, onSave, userId, members, isTeamView = false, absence = null }: MarkAbsenceDialogProps) {
  const form = useForm<AbsenceFormValues>({
    resolver: zodResolver(absenceSchema),
    defaultValues: {
      userId: isTeamView ? '' : userId,
      type: 'General Absence',
      absenceSpan: 'One Time',
      oneTimeDate: { from: new Date(), to: new Date() },
      recurringStartDate: undefined,
      recurringEndDate: undefined,
      daysOfWeek: [],
    },
  });

  const [isOneTimePickerOpen, setIsOneTimePickerOpen] = React.useState(false);
  const [tempOneTimeDate, setTempOneTimeDate] = React.useState<DateRange | undefined>();

  const [isRecurStartPickerOpen, setIsRecurStartPickerOpen] = React.useState(false);
  const [isRecurEndPickerOpen, setIsRecurEndPickerOpen] = React.useState(false);
  
  const absenceSpanWatcher = form.watch('absenceSpan');

  React.useEffect(() => {
    if (isOpen) {
        if (absence) {
            const fromDate = new Date(absence.startDate);
            const toDate = new Date(absence.endDate);
            form.reset({
                userId: absence.userId,
                type: absence.type,
                absenceSpan: 'One Time',
                oneTimeDate: { from: fromDate, to: toDate },
            });
            setTempOneTimeDate({ from: fromDate, to: toDate });
        } else {
            const defaultDate = new Date();
            form.reset({
                userId: isTeamView ? '' : userId,
                type: 'General Absence',
                absenceSpan: 'One Time',
                oneTimeDate: { from: defaultDate, to: defaultDate },
                recurringStartDate: undefined,
                recurringEndDate: undefined,
                daysOfWeek: [],
            });
            setTempOneTimeDate({ from: defaultDate, to: defaultDate });
        }
    }
  }, [isOpen, absence, form, isTeamView, userId]);


  function onSubmit(data: AbsenceFormValues) {
    const targetUserId = isTeamView ? data.userId : userId;
    if (targetUserId) {
        const submitData: AbsenceSubmitData = {
            userId: targetUserId,
            type: data.type as AbsenceType,
            absenceSpan: data.absenceSpan,
        };

        if (data.absenceSpan === 'One Time' && data.oneTimeDate?.from && data.oneTimeDate?.to) {
            submitData.oneTimeDate = { from: data.oneTimeDate.from, to: data.oneTimeDate.to };
        } else if (data.absenceSpan === 'Recurring' && data.recurringStartDate && data.recurringEndDate && data.daysOfWeek) {
            submitData.recurringStartDate = data.recurringStartDate;
            submitData.recurringEndDate = data.recurringEndDate;
            submitData.daysOfWeek = data.daysOfWeek;
        }
      onSave(submitData);
    }
  }

  const handleDateSelect = (range: DateRange | undefined) => {
    if(range?.from && !range.to) {
        setTempOneTimeDate({from: range.from, to: range.from});
    } else {
        setTempOneTimeDate(range);
    }
  }
  
  const dialogTitle = isTeamView ? "Update Roster" : "Update My Roster";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Select a date range and absence type to mark on the roster.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pl-1 pr-4">
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
                name="absenceSpan"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Absence/ Work Span</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!!absence}>
                        <FormControl>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="One Time">One Time</SelectItem>
                            <SelectItem value="Recurring">Recurring</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
             />

            {absenceSpanWatcher === 'Recurring' && (
                <>
                     <FormField
                        control={form.control}
                        name="daysOfWeek"
                        render={() => (
                        <FormItem>
                            <FormLabel>Days of Week</FormLabel>
                            <div className="flex items-center space-x-4">
                            {daysOfWeekOptions.map((item) => (
                                <FormField
                                key={item.id}
                                control={form.control}
                                name="daysOfWeek"
                                render={({ field }) => {
                                    return (
                                    <FormItem
                                        key={item.id}
                                        className="flex flex-row items-start space-x-2 space-y-0"
                                    >
                                        <FormControl>
                                        <Checkbox
                                            checked={field.value?.includes(item.id)}
                                            onCheckedChange={(checked) => {
                                            return checked
                                                ? field.onChange([...(field.value || []), item.id])
                                                : field.onChange(
                                                    field.value?.filter(
                                                    (value) => value !== item.id
                                                    )
                                                )
                                            }}
                                        />
                                        </FormControl>
                                        <FormLabel className="font-normal">
                                        {item.label}
                                        </FormLabel>
                                    </FormItem>
                                    )
                                }}
                                />
                            ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                       <FormField
                            control={form.control}
                            name="recurringStartDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                <FormLabel>Start Date</FormLabel>
                                <Popover open={isRecurStartPickerOpen} onOpenChange={setIsRecurStartPickerOpen}>
                                    <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={(date) => {
                                            field.onChange(date);
                                            setIsRecurStartPickerOpen(false);
                                        }}
                                        initialFocus
                                    />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="recurringEndDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                <FormLabel>End Date</FormLabel>
                                <Popover open={isRecurEndPickerOpen} onOpenChange={setIsRecurEndPickerOpen}>
                                    <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={(date) => {
                                            field.onChange(date);
                                            setIsRecurEndPickerOpen(false);
                                        }}
                                        disabled={{ before: form.getValues('recurringStartDate') }}
                                        initialFocus
                                    />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </>
            )}

            {absenceSpanWatcher === 'One Time' && (
                 <FormField
                    control={form.control}
                    name="oneTimeDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Absence/ Work Dates</FormLabel>
                        <Popover open={isOneTimePickerOpen} onOpenChange={setIsOneTimePickerOpen}>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                variant={"outline"}
                                className={cn("w-full justify-start text-left font-normal", !field.value?.from && "text-muted-foreground")}
                                onClick={() => {
                                    setTempOneTimeDate(field.value);
                                    setIsOneTimePickerOpen(true)
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
                                defaultMonth={tempOneTimeDate?.from}
                                selected={tempOneTimeDate}
                                onSelect={handleDateSelect}
                                numberOfMonths={2}
                            />
                            <div className="p-2 border-t flex justify-end">
                                    <Button size="sm" onClick={() => {
                                        if (tempOneTimeDate?.from) {
                                            field.onChange({
                                                from: tempOneTimeDate.from,
                                                to: tempOneTimeDate.to || tempOneTimeDate.from,
                                            });
                                        }
                                        setIsOneTimePickerOpen(false);
                                    }}>Ok</Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            )}
           
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
                        <SelectItem value="In Office">In Office</SelectItem>
                        <SelectItem value="Home Office">Home Office</SelectItem>
                        <SelectItem value="Clear Absence/ Work">Clear Absence/ Work</SelectItem>
                      </SelectContent>
                    </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
