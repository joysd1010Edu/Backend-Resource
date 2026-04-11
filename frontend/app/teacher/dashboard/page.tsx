"use client";
/* ==========  frontend/app/teacher/dashboard/page.tsx  ===============*/

import { useQuery } from "@tanstack/react-query";
import { FiBarChart2, FiBook, FiClock, FiUsers } from "react-icons/fi";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeacherDashboardMetrics } from "@/lib/api/teacher";

const cards = [
  {
    key: "total_exams",
    label: "Total Exams",
    icon: FiBook,
    group: "exam_overview",
  },
  {
    key: "attended_students",
    label: "Attended Students",
    icon: FiUsers,
    group: "student_overview",
  },
  {
    key: "live_exams_now",
    label: "Live Exams",
    icon: FiClock,
    group: "exam_overview",
  },
  {
    key: "average_percentage",
    label: "Average Percentage",
    icon: FiBarChart2,
    group: "result_overview",
  },
] as const;

export default function TeacherDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher", "dashboard-metrics"],
    queryFn: getTeacherDashboardMetrics,
  });

  const metrics = data?.data;

  return (
    <section className="mx-auto min-h-[85vh] w-full max-w-7xl px-4 py-8 animate-page-enter">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Teacher Dashboard</h1>
        <p className="text-sm text-slate-600">
          Central performance overview across your exams, student participation, and results.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => {
          const Icon = item.icon;
          const value =
            item.group === "exam_overview"
              ? metrics?.exam_overview?.[item.key as "total_exams" | "live_exams_now"]
              : item.group === "student_overview"
                ? metrics?.student_overview?.attended_students
                : metrics?.result_overview?.average_percentage;

          return (
            <Card key={item.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">{item.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-slate-900">
                  {isLoading ? "..." : typeof value === "number" ? value : 0}
                </p>
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
                  <Icon size={16} />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Student & Attempt Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>Total Assigned: {metrics?.student_overview.total_assigned_candidates ?? 0}</p>
            <p>Submitted: {metrics?.student_overview.submitted_students ?? 0}</p>
            <p>Timeout: {metrics?.student_overview.timeout_students ?? 0}</p>
            <p>In Progress Attempts: {metrics?.attempt_overview.in_progress_attempts ?? 0}</p>
            <p>Auto Submitted Attempts: {metrics?.attempt_overview.auto_submitted_attempts ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Exams</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            {(metrics?.recent_exams || []).length === 0 ? (
              <p className="text-slate-500">No recent exam activity yet.</p>
            ) : (
              metrics?.recent_exams.map((exam) => (
                <div key={exam._id} className="rounded-md border border-slate-200 p-3">
                  <p className="font-medium text-slate-800">{exam.title}</p>
                  <p className="text-xs text-slate-500">Status: {exam.status}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
