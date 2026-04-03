
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parse, isValid, getYear, startOfDay, isAfter } from "date-fns";
import { Calendar as CalendarIcon, Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAccessControl } from "../contexts/AccessControlContext";
import { useProjects } from "../contexts/ProjectsContext";
import { useTasks } from "../contexts/TasksContext";
import { useAuth } from "../contexts/AuthContext";
import type { TimeEntry } from "@/lib/types";
import { useMembers } from "../contexts/MembersContext";

const logTimeSchema = z.object({
  userId: z.string().optional(),
  date: z.date({ required_error: "A date is required." }),
  startTime: z.string().min(1, { message: "Start time is required." }),
  endTime: z.string().min(1, { message: "End time is required." }),
  project: z.string().min(1, { message: "Please select a project." }),
  task: z.string().min(1, { message: "Please select a task." }),
  placeOfWork: z.enum(['Home Office', 'In Office']),
  remarks: z.string().min(1, { message: "Remarks are required." }),
}).refine(data => data.endTime > data.startTime, {
  message: "End time cannot be earlier than start time.",
  path: ["endTime"],
}).refine(data => !isAfter(data.date, new Date()), {
    message: "Time logging is not allowed on future dates. Contact your Admin.",
    path: ["date"],
});

export type LogTimeFormValues = z.infer<typeof logTimeSchema>;

interface LogTimeDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: LogTimeFormValues, entryId?: string) => Promise<{ success: boolean }>;
  entryToEdit?: TimeEntry | null;
  userId?: string; // The ID of the user whose time is being logged/edited
}

export function LogTimeDialog({ isOpen, onOpenChange, onSave, entryToEdit, userId }: LogTimeDialogProps) {
  const { currentUser } = useAuth();
  const { teamMembers } = useMembers();
  const isEditMode = !!entryToEdit;

  const form = useForm<LogTimeFormValues>({
    resolver: zodResolver(logTimeSchema),
    defaultValues: {
      userId: currentUser?.id,
      date: new Date(),
      startTime: '',
      endTime: '',
      project: '',
      task: '',
      placeOfWork: 'Home Office',
      remarks: '',
    }
  });

  const selectedUserId = form.watch("userId");
  const targetUser = teamMembers.find(m => m.id === (isEditMode ? userId : selectedUserId));
  
  const { freezeRules } = useAccessControl();
  const [isUserComboboxOpen, setIsUserComboboxOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const isDateFrozen = (date: Date) => {
    if (!targetUser) return false;
    for (const rule of freezeRules) {
      const ruleAppliesToAll = rule.teamId === 'all-teams';
      const ruleAppliesToUserTeam = targetUser?.teamId && rule.teamId === targetUser.teamId;

      if (ruleAppliesToAll || ruleAppliesToUserTeam) {
        const startDate = new Date(rule.startDate);
        const endDate = new Date(rule.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        if (date >= startDate && date <= endDate) {
          return true;
        }
      }
    }
    return false;
  };
  
  const [isFormDisabled, setIsFormDisabled] = useState(false);

  useEffect(() => {
    if (isEditMode && entryToEdit) {
      const [project, ...taskParts] = entryToEdit.task.split(' - ');
      const task = taskParts.join(' - ');
      const entryDate = new Date(entryToEdit.date);
      
      form.reset({
        userId: entryToEdit.userId,
        date: entryDate,
        startTime: entryToEdit.startTime,
        endTime: entryToEdit.endTime,
        project: project.trim(),
        task: task.trim(),
        placeOfWork: entryToEdit.placeOfWork || 'Home Office',
        remarks: entryToEdit.remarks || '',
      });
      setInputValue(format(entryDate, 'dd/MM/yyyy'));
      
      if (isDateFrozen(entryDate)) {
        setIsFormDisabled(true);
      } else {
        setIsFormDisabled(false);
      }

    } else {
      setIsFormDisabled(false);
      form.reset({
        userId: currentUser?.id,
        date: new Date(),
        startTime: '',
        endTime: '',
        project: '',
        task: '',
        placeOfWork: 'Home Office',
        remarks: '',
      });
       setInputValue(format(new Date(), 'dd/MM/yyyy'));
    }
  }, [entryToEdit, isOpen, form, isEditMode, currentUser?.id]);

  useEffect(() => {
    if (targetUser && !isEditMode) {
        form.setValue('project', '');
        form.setValue('task', '');
    }
  }, [selectedUserId, form, isEditMode, targetUser]);


  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const { projects } = useProjects();
  const { tasks: allTasks } = useTasks();

  const availableProjects = projects.filter(p => targetUser?.associatedProjectIds?.includes(p.id));

  const selectedProjectName = form.watch("project");
  
  const availableTasks = React.useMemo(() => {
    if (!selectedProjectName) return [];
    const selectedProject = availableProjects.find(p => p.name === selectedProjectName);
    if (!selectedProject || !selectedProject.taskIds) return [];
    return allTasks.filter(task => selectedProject.taskIds?.includes(task.id));
  }, [selectedProjectName, availableProjects, allTasks]);

  useEffect(() => {
    form.setValue('task', '');
  }, [selectedProjectName, form]);

  async function onSubmit(data: LogTimeFormValues) {
    const { success } = await onSave(data, entryToEdit?.id);
    if(success) {
        onOpenChange(false);
    }
  }

  if (!currentUser) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Time Entry' : 'Log Time'}</DialogTitle>
          <DialogDescription>
            {isFormDisabled 
              ? `This entry cannot be modified because the date is within a frozen period.`
              : isEditMode 
                ? `Editing entry for ${targetUser?.name}.` 
                : "Fill in the details below to log your work time. Click save when you're done."
            }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto px-2">
              <fieldset disabled={isFormDisabled} className="space-y-4 pb-4">
                {!isEditMode && (currentUser.role === 'Super Admin' || currentUser.role === 'Team Lead') && (
                  <FormField
                    control={form.control}
                    name="userId"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>User</FormLabel>
                          <Popover open={isUserComboboxOpen} onOpenChange={setIsUserComboboxOpen}>
                              <PopoverTrigger asChild>
                                  <FormControl>
                                  <Button
                                      variant="outline"
                                      role="combobox"
                                      className={cn(
                                      "justify-between",
                                      !field.value && "text-muted-foreground"
                                      )}
                                  >
                                      {field.value
                                      ? teamMembers.find(
                                          (member) => member.id === field.value
                                          )?.name
                                      : "Select a user"}
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                  </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="p-0">
                                  <Command>
                                  <CommandInput placeholder="Search user..." />
                                  <CommandList>
                                      <CommandEmpty>No user found.</CommandEmpty>
                                      <CommandGroup>
                                          {teamMembers.map((member) => (
                                          <CommandItem
                                              value={member.name}
                                              key={member.id}
                                              onSelect={() => {
                                                  form.setValue("userId", member.id);
                                                  setIsUserComboboxOpen(false);
                                              }}
                                          >
                                              <Check
                                              className={cn(
                                                  "mr-2 h-4 w-4",
                                                  member.id === field.value
                                                  ? "opacity-100"
                                                  : "opacity-0"
                                              )}
                                              />
                                              {member.name}
                                          </CommandItem>
                                          ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                              </PopoverContent>
                          </Popover>
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
                          <FormLabel>Date</FormLabel>
                          <div className="relative">
                              <FormControl>
                                  <Input
                                      placeholder="DD/MM/YYYY"
                                      value={inputValue}
                                      onChange={(e) => {
                                          const value = e.target.value;
                                          setInputValue(value);
                                          const parsedDate = parse(value, 'dd/MM/yyyy', new Date());
                                          if (isValid(parsedDate) && getYear(parsedDate) > 1000) {
                                              field.onChange(parsedDate);
                                          }
                                      }}
                                      onBlur={() => setInputValue(field.value ? format(field.value, 'dd/MM/yyyy') : '')}
                                      disabled={isEditMode}
                                      className="pr-10"
                                  />
                              </FormControl>
                              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                                  <PopoverTrigger asChild>
                                      <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
                                          disabled={isEditMode}
                                      >
                                          <CalendarIcon className="h-4 w-4" />
                                      </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar
                                          mode="single"
                                          selected={field.value}
                                          onSelect={(date) => {
                                              if (date) {
                                                  field.onChange(date);
                                                  setInputValue(format(date, 'dd/MM/yyyy'));
                                              }
                                              setIsDatePickerOpen(false);
                                          }}
                                          toDate={new Date()}
                                          disabled={(date) => isAfter(date, new Date()) || isDateFrozen(date)}
                                          initialFocus
                                          captionLayout="dropdown-buttons"
                                          fromYear={new Date().getFullYear() - 10}
                                          toYear={new Date().getFullYear()}
                                      />
                                  </PopoverContent>
                              </Popover>
                          </div>
                          <FormMessage />
                      </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="project"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!targetUser}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableProjects.length > 0 ? (
                            availableProjects.map((project) => (
                              <SelectItem key={project.id} value={project.name}>{project.name}</SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>No projects assigned</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="task"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!selectedProjectName}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a task" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableTasks.map((task) => (
                            <SelectItem key={task.id} value={task.name}>{task.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="placeOfWork"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Place of Work</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select place of work" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Home Office">Home Office</SelectItem>
                          <SelectItem value="In Office">In Office</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Add any extra details..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </fieldset>
            </div>
            <DialogFooter className="pt-4 mt-auto border-t">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={isFormDisabled}>{isEditMode ? 'Save Changes' : 'Log Time'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
