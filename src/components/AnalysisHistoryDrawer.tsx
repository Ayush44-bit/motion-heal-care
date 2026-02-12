import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { History, Trash2, ArrowLeftRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisRecord } from "@/hooks/useAnalysisHistory";

interface AnalysisHistoryDrawerProps {
  records: AnalysisRecord[];
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

const AnalysisHistoryDrawer = ({ records, onDelete, onRefresh }: AnalysisHistoryDrawerProps) => {
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const [open, setOpen] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) onRefresh();
    else setCompareIds(null);
  };

  const toggleCompare = (id: string) => {
    if (!compareIds) {
      setCompareIds([id, ""]);
    } else if (compareIds[0] === id) {
      setCompareIds(null);
    } else if (!compareIds[1]) {
      setCompareIds([compareIds[0], id]);
    } else {
      setCompareIds([id, ""]);
    }
  };

  const comparing = compareIds && compareIds[1];
  const compareRecords = comparing
    ? [records.find((r) => r.id === compareIds![0]), records.find((r) => r.id === compareIds![1])]
    : null;

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <History className="w-3 h-3" />
          History
          {records.length > 0 && (
            <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{records.length}</span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="w-5 h-5" /> Analysis History
          </SheetTitle>
        </SheetHeader>

        {records.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            No analysis history yet. Run an analysis to start building your history.
          </div>
        ) : comparing && compareRecords?.[0] && compareRecords?.[1] ? (
          <div className="flex-1 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground flex items-center gap-1">
                <ArrowLeftRight className="w-4 h-4" /> Comparing analyses
              </p>
              <Button variant="ghost" size="sm" onClick={() => setCompareIds(null)}>
                <X className="w-3 h-3 mr-1" /> Exit compare
              </Button>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3 overflow-hidden">
              {compareRecords.map((rec, idx) => (
                <div key={idx} className="flex flex-col overflow-hidden border rounded-lg">
                  <div className="p-2 bg-muted text-xs font-medium text-muted-foreground">
                    {format(new Date(rec!.timestamp), "MMM d, yyyy · h:mm a")}
                  </div>
                  <ScrollArea className="flex-1 p-3">
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90">
                      <ReactMarkdown>{rec!.content}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-3 pr-2">
              <AnimatePresence>
                {records.map((record) => {
                  const isSelected = compareIds?.[0] === record.id || compareIds?.[1] === record.id;
                  return (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`border rounded-lg overflow-hidden ${isSelected ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="p-3 bg-muted/50 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(record.timestamp), "MMM d, yyyy · h:mm a")}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">{record.mode} analysis</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {records.length >= 2 && (
                            <Button
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => toggleCompare(record.id)}
                            >
                              <ArrowLeftRight className="w-3 h-3 mr-1" />
                              {isSelected ? "Selected" : "Compare"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => onDelete(record.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <Separator />
                      <div className="p-3 max-h-48 overflow-y-auto">
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground">
                          <ReactMarkdown>{record.content}</ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default AnalysisHistoryDrawer;
