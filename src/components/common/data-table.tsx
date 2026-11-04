"use client";

import { useState, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DataTable<T>({
  data, columns, onRowClick, empty, pageSize = 10, initialSort, getRowId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: T[]; columns: ColumnDef<T, any>[]; onRowClick?: (row: T) => void; empty?: ReactNode; pageSize?: number; initialSort?: SortingState; getRowId?: (row: T) => string;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const table = useReactTable({
    data, columns, state: { sorting }, onSortingChange: setSorting, getRowId,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } }, autoResetPageIndex: false,
  });
  const { pageIndex } = table.getState().pagination;
  const pages = table.getPageCount();
  if (pageIndex > 0 && pageIndex >= pages) table.setPageIndex(0);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <th key={h.id} scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined} className="px-4 py-2.5 text-left text-[13px] font-semibold whitespace-nowrap text-muted-foreground">
                      {sortable ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? <ArrowUp className="size-3.5" /> : dir === "desc" ? <ArrowDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-40" />}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn("border-b border-border/70 last:border-0", onRowClick && "cursor-pointer hover:bg-accent/50")}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2.5 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && <div>{empty ?? <p className="p-8 text-center text-sm text-muted-foreground">No records match these filters.</p>}</div>}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[13px] text-muted-foreground">
          <span>{data.length} records</span>
          <div className="flex items-center gap-2">
            <span>Page {pageIndex + 1} of {pages}</span>
            <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button>
            <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
