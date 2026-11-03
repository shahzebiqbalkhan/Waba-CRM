"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import {
  extractTemplateVariables,
  extractVariableIndices,
} from "@/lib/whatsapp/template-validators";
import {
  MEDIA_HEADER_SPECS,
  type MediaHeaderKind,
} from "@/lib/whatsapp/media-header-types";
import { uploadAccountMedia } from "@/lib/storage/upload-media";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export interface TemplateSendValues {
  body: string[];
  headerText?: string;
  headerMediaUrl?: string;
  headerMediaFilename?: string;
  buttonParams?: Record<number, string>;
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
}

function renderBodyPreview(body: string, params: string[]): string {
  const keys = extractTemplateVariables(body);
  return body.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (match, key: string) => {
    const value = params[keys.indexOf(key)];
    return value && value.trim().length > 0 ? value : match;
  });
}

interface UrlButtonSlot {
  index: number;
  text: string;
  url: string;
}

/**
 * Templates may need values for: body variables, a text-header
 * variable, media header (document/image/video), and per-URL-button suffixes.
 * Collect them all so the send-message path doesn't 400 on missing parameters.
 */
function collectVariableSlots(template: MessageTemplate): {
  bodyVars: string[];
  headerVar: string | null;
  mediaHeaderType: MediaHeaderKind | null;
  urlButtonSlots: UrlButtonSlot[];
} {
  const bodyVars = extractTemplateVariables(template.body_text);
  const headerVar =
    template.header_type === "text" && template.header_content
      ? (extractTemplateVariables(template.header_content)[0] ?? null)
      : null;
  const mediaHeaderType =
    template.header_type === "document" ||
    template.header_type === "image" ||
    template.header_type === "video"
      ? (template.header_type as MediaHeaderKind)
      : null;

  const urlButtonSlots: UrlButtonSlot[] = [];
  (template.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && extractVariableIndices(b.url).length > 0) {
      urlButtonSlots.push({ index: i, text: b.text, url: b.url });
    }
  });

  return { bodyVars, headerVar, mediaHeaderType, urlButtonSlots };
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
}: TemplatePickerProps) {
  const t = useTranslations("Inbox.templatePicker");

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState<string>("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>("");
  const [headerMediaFilename, setHeaderMediaFilename] = useState<string>("");
  const [uploadingMedia, setUploadingMedia] = useState<boolean>(false);
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});
  const mediaFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      // Scope by RLS (message_templates_select → is_account_member), NOT by
      // user_id. Templates are account-owned, so filtering on the caller's
      // user_id hid templates that a teammate created — leaving them unable
      // to send approved templates in a shared account.
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch templates:", error);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function resetSelection() {
    setSelected(null);
    setParams([]);
    setHeaderText("");
    setHeaderMediaUrl("");
    setHeaderMediaFilename("");
    setButtonParams({});
    setUploadingMedia(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetSelection();
    onOpenChange(next);
  }

  function pickTemplate(template: MessageTemplate) {
    const slots = collectVariableSlots(template);
    // If a media header is present (document/image/video), the modal MUST open
    // so the user can attach or verify their document/media file.
    const noInputsNeeded =
      slots.bodyVars.length === 0 &&
      slots.headerVar === null &&
      slots.mediaHeaderType === null &&
      slots.urlButtonSlots.length === 0;

    if (noInputsNeeded) {
      onSelect(template, { body: [] });
      handleOpenChange(false);
      return;
    }

    setSelected(template);
    setParams(new Array(slots.bodyVars.length).fill(""));
    setHeaderText("");
    setHeaderMediaUrl(template.header_media_url || "");
    setHeaderMediaFilename(
      template.header_media_url
        ? template.header_media_url.split("/").pop()?.split("?")[0] || ""
        : ""
    );
    setButtonParams({});
  }

  async function handleMediaUpload(file: File, kind: MediaHeaderKind) {
    const spec = MEDIA_HEADER_SPECS[kind];
    if (spec && !spec.mimeTypes.includes(file.type)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const allowedExts = Object.values(spec.extensions);
      if (!allowedExts.includes(ext)) {
        toast.error(
          t("invalidFileType", { format: spec.formats })
        );
        return;
      }
    }

    // 16 MB maximum bucket limit
    const maxBytes = 16 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(
        t("fileTooLarge", { size: (file.size / 1024 / 1024).toFixed(1) })
      );
      return;
    }

    setUploadingMedia(true);
    try {
      const { publicUrl } = await uploadAccountMedia("chat-media", file);
      setHeaderMediaUrl(publicUrl);
      setHeaderMediaFilename(file.name);
      toast.success(
        t("uploadSuccess", {
          type:
            kind === "document"
              ? "Document"
              : kind === "image"
                ? "Image"
                : "Video",
        })
      );
    } catch (err) {
      console.error("Failed to upload media:", err);
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploadingMedia(false);
    }
  }

  function confirm() {
    if (!selected) return;
    const values: TemplateSendValues = { body: params };
    if (headerText.trim()) values.headerText = headerText.trim();
    if (headerMediaUrl.trim()) values.headerMediaUrl = headerMediaUrl.trim();
    if (headerMediaFilename.trim()) {
      values.headerMediaFilename = headerMediaFilename.trim();
    }
    if (Object.keys(buttonParams).length > 0) {
      values.buttonParams = Object.fromEntries(
        Object.entries(buttonParams).map(([k, v]) => [Number(k), v.trim()])
      );
    }
    onSelect(selected, values);
    handleOpenChange(false);
  }

  const slots = useMemo(
    () => (selected ? collectVariableSlots(selected) : null),
    [selected]
  );

  const canConfirm =
    !!selected &&
    !!slots &&
    slots.bodyVars.every((_, i) => (params[i] ?? "").trim().length > 0) &&
    (slots.headerVar === null || headerText.trim().length > 0) &&
    (slots.mediaHeaderType === null || headerMediaUrl.trim().length > 0) &&
    !uploadingMedia &&
    slots.urlButtonSlots.every(
      (s) => (buttonParams[s.index] ?? "").trim().length > 0
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            {selected ? selected.name : t("sendTemplate")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selected ? t("fillPlaceholders") : t("pickTemplate")}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-md border border-border bg-background/50 p-6 text-center">
                <p className="text-sm text-popover-foreground">
                  {t("noApprovedTemplates")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("noApprovedTemplatesHint")}
                </p>
              </div>
            ) : (
              templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => pickTemplate(tmpl)}
                  className="w-full rounded-md border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-popover"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-popover-foreground">
                          {tmpl.name}
                        </p>
                        <Badge className="border border-primary/30 bg-primary/20 text-[10px] text-primary">
                          {tmpl.category}
                        </Badge>
                        {tmpl.header_type && tmpl.header_type !== "text" && (
                          <Badge
                            variant="outline"
                            className="flex items-center gap-1 border-primary/20 bg-background/80 text-[10px] text-primary"
                          >
                            {tmpl.header_type === "document" && (
                              <FileText className="h-3 w-3" />
                            )}
                            {tmpl.header_type === "image" && (
                              <ImageIcon className="h-3 w-3" />
                            )}
                            {tmpl.header_type === "video" && (
                              <Video className="h-3 w-3" />
                            )}
                            <span className="capitalize">{tmpl.header_type}</span>
                          </Badge>
                        )}
                        {tmpl.language && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {tmpl.language}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {tmpl.body_text}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <div className="rounded-md border border-border bg-background/50 p-3">
              <p className="mb-1 text-xs text-muted-foreground">{t("preview")}</p>
              <p className="whitespace-pre-wrap text-sm text-popover-foreground">
                {renderBodyPreview(selected.body_text, params)}
              </p>
              {selected.footer_text && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  {selected.footer_text}
                </p>
              )}
            </div>

            {/* Media Header (Document / Image / Video) Attachment Section */}
            {slots?.mediaHeaderType && (
              <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold text-popover-foreground">
                    {slots.mediaHeaderType === "document" ? (
                      <>
                        <FileText className="h-4 w-4 text-primary" />
                        <span>{t("headerMediaDocument")}</span>
                      </>
                    ) : slots.mediaHeaderType === "image" ? (
                      <>
                        <ImageIcon className="h-4 w-4 text-primary" />
                        <span>{t("headerMediaImage")}</span>
                      </>
                    ) : (
                      <>
                        <Video className="h-4 w-4 text-primary" />
                        <span>{t("headerMediaVideo")}</span>
                      </>
                    )}
                    <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {slots.mediaHeaderType}
                  </span>
                </div>

                <input
                  ref={mediaFileInputRef}
                  type="file"
                  accept={
                    slots.mediaHeaderType === "document"
                      ? ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                      : slots.mediaHeaderType === "image"
                        ? "image/jpeg,image/png"
                        : "video/mp4,video/3gpp"
                  }
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && slots.mediaHeaderType) {
                      void handleMediaUpload(f, slots.mediaHeaderType);
                    }
                    e.target.value = "";
                  }}
                />

                {headerMediaUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 p-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        {slots.mediaHeaderType === "document" ? (
                          <FileText className="h-5 w-5 flex-shrink-0 text-primary" />
                        ) : slots.mediaHeaderType === "image" ? (
                          <ImageIcon className="h-5 w-5 flex-shrink-0 text-primary" />
                        ) : (
                          <Video className="h-5 w-5 flex-shrink-0 text-primary" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">
                            {headerMediaFilename ||
                              headerMediaUrl.split("/").pop()?.split("?")[0] ||
                              t("attachedFile")}
                          </p>
                          <a
                            href={headerMediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-[11px] text-primary hover:underline"
                          >
                            {t("viewAttachment")}
                          </a>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={uploadingMedia}
                          onClick={() => mediaFileInputRef.current?.click()}
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Upload className="mr-1 h-3.5 w-3.5" />
                          {t("changeFile")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={uploadingMedia}
                          onClick={() => {
                            setHeaderMediaUrl("");
                            setHeaderMediaFilename("");
                          }}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          title={t("removeFile")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {slots.mediaHeaderType === "image" && (
                      <div className="flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={headerMediaUrl}
                          alt="Header preview"
                          className="max-h-32 rounded border border-border object-contain"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingMedia}
                      onClick={() => mediaFileInputRef.current?.click()}
                      className="w-full border-dashed border-border bg-muted/40 py-5 hover:bg-muted/70"
                    >
                      {uploadingMedia ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                          <span>{t("uploading")}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4 text-primary" />
                          <span>
                            {slots.mediaHeaderType === "document"
                              ? t("uploadDocument")
                              : slots.mediaHeaderType === "image"
                                ? t("uploadImage")
                                : t("uploadVideo")}
                          </span>
                        </>
                      )}
                    </Button>
                    <p className="text-center text-[11px] text-muted-foreground">
                      {slots.mediaHeaderType === "document"
                        ? t("docFormatsHint")
                        : slots.mediaHeaderType === "image"
                          ? t("imgFormatsHint")
                          : t("vidFormatsHint")}
                    </p>
                  </div>
                )}

                <div className="pt-1">
                  <Input
                    type="url"
                    value={headerMediaUrl}
                    onChange={(e) => {
                      setHeaderMediaUrl(e.target.value);
                      setHeaderMediaFilename(
                        e.target.value.split("/").pop()?.split("?")[0] || ""
                      );
                    }}
                    placeholder={
                      slots.mediaHeaderType === "document"
                        ? t("docUrlPlaceholder")
                        : t("mediaUrlPlaceholder")
                    }
                    className="h-8 border-border bg-muted text-xs text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            )}

            {slots?.headerVar && (
              <div className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {t("headerVarLabel", { var: `{{${slots.headerVar}}}` })}
                </Label>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder={t("headerValuePlaceholder")}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            )}

            {slots?.bodyVars.map((v, i) => (
              <div key={v} className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {t("bodyVarLabel", { var: `{{${v}}}` })}
                </Label>
                <Input
                  value={params[i] ?? ""}
                  onChange={(e) => {
                    const next = [...params];
                    next[i] = e.target.value;
                    setParams(next);
                  }}
                  placeholder={t("bodyValuePlaceholder", { val: `{{${v}}}` })}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}

            {slots?.urlButtonSlots.map((slot) => (
              <div key={slot.index} className="space-y-1">
                <Label className="text-xs text-popover-foreground">
                  {t("urlButtonVarLabel", { text: slot.text, var: "{{1}}" })}
                </Label>
                <Input
                  value={buttonParams[slot.index] ?? ""}
                  onChange={(e) =>
                    setButtonParams((prev) => ({
                      ...prev,
                      [slot.index]: e.target.value,
                    }))
                  }
                  placeholder={t("urlSuffixValuePlaceholder")}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="break-all text-[10px] text-muted-foreground">
                  {t("finalUrl", {
                    url: slot.url.replace(
                      /\{\{1\}\}/g,
                      buttonParams[slot.index] || "{{1}}"
                    ),
                  })}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {selected ? (
            <>
              <Button
                variant="outline"
                onClick={resetSelection}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("back")}
              </Button>
              <Button
                disabled={!canConfirm}
                onClick={confirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {t("send")}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
