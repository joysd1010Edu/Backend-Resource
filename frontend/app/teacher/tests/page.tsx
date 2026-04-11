"use client";
/* ==========  frontend/app/teacher/tests/page.tsx  ===============*/

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTeacherTests } from "@/lib/api/teacher";

export default function TeacherTestsPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["teacher", "tests", search],
    queryFn: () => getTeacherTests({ page: 1, limit: 20, search }),
  });

  return (
    <section className="mx-auto min-h-[85vh] w-full max-w-7xl px-4 py-8 animate-page-enter">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">All Test</h1>
          <p className="text-sm text-slate-600">
            Browse and manage your created exams.
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exam title"
          className="sm:w-72"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.items || []).map((test) => (
          <Card key={test._id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{test.title}</span>
                <Badge variant="secondary">{test.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-slate-600">
              <p>Duration: {test.duration_minutes} min</p>
              <p>Candidates: {test.total_candidates}</p>
              <p>Slots: {test.total_slots}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && (data?.items || []).length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">
          No tests found for this filter.
        </p>
      ) : null}
    </section>
  );
}
