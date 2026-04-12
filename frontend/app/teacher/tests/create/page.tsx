"use client";
/* ==========  frontend/app/teacher/tests/create/page.tsx  ===============*/

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { showTaskError, showTaskSuccess } from "@/lib/alerts/appAlert";
import { createTeacherTest } from "@/lib/api/teacher";

type CreateTestFormState = {
  title: string;
  total_audience: string;
  total_slots: string;
  total_question_set: string;
  question_type_mode: "mixed" | "radio" | "checkbox" | "text";
  start_time: string;
  end_time: string;
  duration_minutes: string;
};

/* ==========  Function parseErrorMessage extracts a readable error message from unknown API failures.  ===============*/
function parseErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object" &&
    (error as { response?: unknown }).response !== null
  ) {
    const responseData = (
      error as {
        response?: {
          data?: {
            message?: string;
            errors?: Array<{ field?: string; message?: string }>;
          };
        };
      }
    ).response?.data;

    const firstValidationError = responseData?.errors?.find(
      (item) => typeof item?.message === "string" && item.message.trim(),
    );

    if (firstValidationError?.message) {
      return firstValidationError.field
        ? `${firstValidationError.field}: ${firstValidationError.message}`
        : firstValidationError.message;
    }

    if (typeof responseData?.message === "string") {
      return responseData.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Please check your input and try again.";
}

export default function CreateTeacherTestPage() {
  const router = useRouter();
  const [form, setForm] = useState<CreateTestFormState>({
    title: "",
    total_audience: "0",
    total_slots: "1",
    total_question_set: "1",
    question_type_mode: "mixed",
    start_time: "",
    end_time: "",
    duration_minutes: "",
  });

  const createMutation = useMutation({
    mutationFn: createTeacherTest,
  });

  /* ==========  Function handleSubmit submits basic test info and redirects back to test list on success.  ===============*/
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const duration = Number(form.duration_minutes);
    const totalAudience = Number(form.total_audience);
    const totalSlots = Number(form.total_slots);
    const totalQuestionSet = Number(form.total_question_set);
    const startTime = new Date(form.start_time);
    const endTime = new Date(form.end_time);

    if (!form.title.trim()) {
      await showTaskError(
        "Create online test",
        "Online test title is required.",
      );
      return;
    }

    if (!Number.isFinite(duration) || duration < 1) {
      await showTaskError(
        "Create online test",
        "Duration must be at least 1 minute.",
      );
      return;
    }

    if (
      !Number.isFinite(totalAudience) ||
      totalAudience < 0 ||
      !Number.isInteger(totalAudience)
    ) {
      await showTaskError(
        "Create online test",
        "Total audience must be a whole number greater than or equal to 0.",
      );
      return;
    }

    if (!Number.isInteger(totalSlots) || totalSlots < 1) {
      await showTaskError(
        "Create online test",
        "Total slots must be at least 1.",
      );
      return;
    }

    if (!Number.isInteger(totalQuestionSet) || totalQuestionSet < 1) {
      await showTaskError(
        "Create online test",
        "Total question set must be at least 1.",
      );
      return;
    }

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      await showTaskError(
        "Create online test",
        "Start time and end time are required.",
      );
      return;
    }

    if (endTime <= startTime) {
      await showTaskError(
        "Create online test",
        "End time must be greater than start time.",
      );
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: form.title.trim(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: duration,
        total_candidates: totalAudience,
        total_slots: totalSlots,
        total_question_set: totalQuestionSet,
        question_type_mode: form.question_type_mode,
      });

      await showTaskSuccess(
        "Create online test",
        "Basic test info saved. You can now manage candidates and question sets.",
      );

      router.push("/teacher/tests");
    } catch (error) {
      await showTaskError("Create online test", parseErrorMessage(error));
    }
  }

  return (
    <section className="mx-auto min-h-[85vh] w-full max-w-7xl px-4 py-8 animate-page-enter">
      <Card className="border-slate-200 bg-white shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <CardTitle className="text-2xl font-semibold text-slate-900">
              Manage Online Test
            </CardTitle>
            <div className="mt-3 flex items-center gap-3 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-2 text-indigo-600">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
                  1
                </span>
                Basic Info
              </span>
              <span className="h-px w-12 bg-slate-300 sm:w-16" />
              <span className="inline-flex items-center gap-2 text-slate-400">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-500">
                  2
                </span>
                Questions
              </span>
            </div>
          </div>

          <Button asChild variant="outline" className="rounded-lg">
            <Link href="/teacher/dashboard">Back to Dashboard</Link>
          </Button>
        </CardHeader>

        <CardContent className="py-6">
          <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">
                Basic Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="title"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Online Test Title
                  </label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Enter online test title"
                    className="h-11 bg-white"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="totalAudience"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Total Audience
                    </label>
                    <Input
                      id="totalAudience"
                      type="number"
                      min={0}
                      step={1}
                      value={form.total_audience}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          total_audience: event.target.value,
                        }))
                      }
                      placeholder="Total audience"
                      className="h-11 bg-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="totalSlots"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Total Slots
                    </label>
                    <select
                      id="totalSlots"
                      value={form.total_slots}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          total_slots: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="totalQuestionSet"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Total Question Set
                    </label>
                    <select
                      id="totalQuestionSet"
                      value={form.total_question_set}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          total_question_set: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="questionType"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Question Type
                    </label>
                    <select
                      id="questionType"
                      value={form.question_type_mode}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          question_type_mode: event.target
                            .value as CreateTestFormState["question_type_mode"],
                        }))
                      }
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
                    >
                      <option value="mixed">Mixed</option>
                      <option value="radio">Radio</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="text">Text</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="startTime"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Start Time
                    </label>
                    <Input
                      id="startTime"
                      type="datetime-local"
                      value={form.start_time}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          start_time: event.target.value,
                        }))
                      }
                      className="h-11 bg-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="endTime"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      End Time
                    </label>
                    <Input
                      id="endTime"
                      type="datetime-local"
                      value={form.end_time}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          end_time: event.target.value,
                        }))
                      }
                      className="h-11 bg-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="duration"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Duration (minutes)
                    </label>
                    <Input
                      id="duration"
                      type="number"
                      min={1}
                      value={form.duration_minutes}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          duration_minutes: event.target.value,
                        }))
                      }
                      placeholder="Duration Time"
                      className="h-11 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="min-w-28 rounded-lg"
                onClick={() => router.push("/teacher/tests")}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="min-w-36 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
              >
                {createMutation.isPending ? "Saving..." : "Save & Continue"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
