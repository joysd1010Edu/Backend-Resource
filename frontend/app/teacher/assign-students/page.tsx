"use client";
/* ==========  frontend/app/teacher/assign-students/page.tsx  ===============*/

import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeacherTests } from "@/lib/api/teacher";

export default function AssignStudentsPage() {
  const { data } = useQuery({
    queryKey: ["teacher", "tests", "assign-page"],
    queryFn: () => getTeacherTests({ page: 1, limit: 10 }),
  });

  return (
    <section className="mx-auto min-h-[85vh] w-full max-w-7xl px-4 py-8 animate-page-enter">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Assign Students
        </h1>
        <p className="text-sm text-slate-600">
          Use the API flow to assign students by slot and question set for each
          exam.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Exams for Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          {(data?.items || []).length === 0 ? (
            <p className="text-slate-500">
              Create an exam first to start assignment.
            </p>
          ) : (
            data?.items.map((test) => (
              <div
                key={test._id}
                className="rounded-md border border-slate-200 p-3"
              >
                <p className="font-medium text-slate-800">{test.title}</p>
                <p className="text-xs text-slate-500">
                  Candidates: {test.total_candidates} | Status: {test.status}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
