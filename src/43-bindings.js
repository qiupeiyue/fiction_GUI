  /* ================= 事件绑定 ================= */
  async function bindUI() {
    if (typeof initNovelView === "function") initNovelView();
    bindUiDialogs();
    // 换小说＝进这本小说的「工作区」：锁着的话先要密码，不给就退回原来那本
    $("#project-select").addEventListener("change", async (e) => {
      const sel = e.target;
      const id = sel.value;
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      // soft：可以取消，取消就还在原来那本（别把人锁死在一本打不开的小说前面）
      const ok = await requireNovelAccess(p, true);
      if (!ok) {
        renderProjectSelect();
        return;
      }
      await setActiveProject(id);
    });
    $("#new-project-btn").addEventListener("click", createProject);
    $("#rename-project-btn").addEventListener("click", renameProject);
    $("#delete-project-btn").addEventListener("click", deleteProject);
    const copyProjBtn = $("#copy-project-btn");
    if (copyProjBtn) copyProjBtn.addEventListener("click", duplicateProject);
    const saveWorkspaceBtn = $("#save-workspace-btn");
    if (saveWorkspaceBtn) saveWorkspaceBtn.addEventListener("click", saveWorkspaceNow);

    $("#new-task-btn").addEventListener("click", createTask);
    const clearWsBtn = $("#clear-workspace-btn");
    if (clearWsBtn) clearWsBtn.addEventListener("click", clearWorkspaceFlow);
    $("#agent-form").addEventListener("submit", submitAgentForm);
    $("#agent-provider").addEventListener("change", onAgentProviderChange);
    $("#agent-model").addEventListener("change", onAgentModelChange);
    $("#agent-test-btn").addEventListener("click", testAgentConnection);
    $("#e-chapter").addEventListener("change", () => {
      renderSectionSelect($("#e-chapter").value, "");
      syncEventFormRowFromChapterSection();
    });
    $("#e-section").addEventListener("change", syncEventFormRowFromChapterSection);
    $("#e-row").addEventListener("input", syncEventFormChapterSectionFromRow);
    const autoDetectBtn = $("#auto-detect-btn");
    if (autoDetectBtn) autoDetectBtn.addEventListener("click", autoDetectAndAssign);
    const autoAbsorbBtn = $("#auto-absorb-btn");
    if (autoAbsorbBtn) autoAbsorbBtn.addEventListener("click", tidyChaptersAndSections);
    const applySegBtn = $("#apply-seg-structure-btn");
    if (applySegBtn)
      applySegBtn.addEventListener("click", async () => {
        pendingUndoLabel = "按识别的章 / 节建立章节";
        const n = buildChaptersFromSegments();
        const segTask = getSelectedTask();
        if (segTask) segTask.segApplied = true; // 点过「划分章节」就不再问
        saveState();
      // 不管有没有新增都刷新一遍：点完就能在章节边栏 / 事件轴看到结果，不会「像没反应」
        renderChapterRail();
        renderTimeline();
        renderMatrix();
      const sum = chapterStructureSummary();
      if (!n) {
        uiAlert(
          `没有新增：识别出的章 / 节都已经在章节结构里了。\n\n` +
            `事件轴没有事件卡，是因为还没分析出事件：先在文本分析里勾选段落分析，再把结果「填入」。`
        );
        return;
      }
        uiAlert(
        `已建立 ${n} 个章节 / 小节${
          lastPlacedCount ? `，并把 ${lastPlacedCount} 个事件归到对应的章 / 节下面` : ""
        }。`
        );
      });
    const pickAllBtn = $("#seg-pick-all-btn");
    if (pickAllBtn)
      pickAllBtn.addEventListener("click", () => {
        const task = getSelectedTask();
        if (!task) return;
        /* 还有没勾的：优先只勾「还没分析成功的」那些（已分析过的保持原样）；
           要是没勾的都已经分析过了，那就照「全选」的意思全勾回来；
           全都勾着时再点＝取消全选。 */
        const segs = task.segments || [];
        const unit = segs.filter((s) => segLevelOf(s) !== "merge");
        const unchecked = unit.filter((s) => s.included === false);
        const todoUnchecked = unchecked.filter((s) => s.analyzed !== true);
        if (!unchecked.length) clearSegmentPicks(task);
        else if (todoUnchecked.length) pickUnanalyzedSegments(task);
        else pickAllSegments(task);
      });
    $("#stats-include-extra").addEventListener("change", renderStats);
    /* 视图内的选项卡（事件轴 / 二维事件图 / 时间线；人物分析 / 出场统计 / 势力分析 / 雷达分析）
       每个视图头里都摆一套，点哪个都走 switchTab；高亮由 syncViewTabs() 统一管 */
    $$("[data-view-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.viewTab;
        if (!id) return;
        if (id === "radar" && !radarOn()) {
          uiAlert("雷达图现在被禁用了。到「设置 → 人物 → 雷达图」点「启用」之后，才能用雷达分析。");
          return;
        }
        switchTab(id);
      })
    );
    const radarIncludeExtra = $("#radar-include-extra");
    if (radarIncludeExtra) radarIncludeExtra.addEventListener("change", renderRadarAnalysis);
    const radarChartClose = $("#radar-chart-close");
    if (radarChartClose) radarChartClose.addEventListener("click", hideRadarOverlay);
    const radarBatchBtn = $("#radar-batch-btn");
    if (radarBatchBtn)
      radarBatchBtn.addEventListener("click", () => {
        radarBatchMode = !radarBatchMode;
        if (radarBatchMode) SHORTCUT_SEL.radar = { anchor: null, base: null };
        renderRadarAnalysis();
      });
    const radarChartBtn = $("#radar-chart-btn");
    if (radarChartBtn) radarChartBtn.addEventListener("click", () => showRadarOverlay());
    // 出场统计 / 雷达分析：顶部搜索框（Ctrl+F 可以直接聚焦）
    const radarSearch = $("#radar-search");
    if (radarSearch) {
      radarSearch.addEventListener("input", () => {
        radarQuery = radarSearch.value;
        renderRadarAnalysis();
      });
      radarSearch.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && radarSearch.value) {
          ev.stopPropagation();
          radarSearch.value = "";
          radarQuery = "";
          renderRadarAnalysis();
        }
      });
    }
    const statsSearch = $("#stats-search");
    if (statsSearch) {
      statsSearch.addEventListener("input", () => {
        statsQuery = statsSearch.value;
        renderStats();
      });
      statsSearch.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && statsSearch.value) {
          ev.stopPropagation();
          statsSearch.value = "";
          statsQuery = "";
          renderStats();
        }
      });
    }
    syncRadarAnalysisButton();
    const chronoResetBtn = $("#chrono-reset-btn");
    if (chronoResetBtn) chronoResetBtn.addEventListener("click", resetChronoOrder);
    const entryRefreshBtn = $("#entry-agent-refresh-btn");
    if (entryRefreshBtn) entryRefreshBtn.addEventListener("click", refreshSettingCategory);
    const newFactionBtn = $("#new-faction-btn");
    if (newFactionBtn) newFactionBtn.addEventListener("click", createFactionFromAnalysis);
    const factionVennBtn = $("#faction-venn-btn");
    if (factionVennBtn)
      factionVennBtn.addEventListener("click", () => {
        // 和「生成雷达图」一样：按当前选中的势力画出来（选多了只画前 3 个）
        if (factionSel.size < 2) {
          showToast(uiTextFor("先在下面的表里勾 2~3 个势力"));
          return;
        }
        showFactionVenn();
      });
    const factionVennClose = $("#faction-venn-close");
    if (factionVennClose) factionVennClose.addEventListener("click", hideFactionVenn);
    const factionBatchBtn = $("#faction-batch-btn");
    if (factionBatchBtn)
      factionBatchBtn.addEventListener("click", () => {
        factionBatchMode = !factionBatchMode;
        if (factionBatchMode) SHORTCUT_SEL.faction = { anchor: null, base: null };
        renderFactionAnalysis();
      });
    const factionIncludeExtra = $("#faction-include-extra");
    if (factionIncludeExtra)
      factionIncludeExtra.addEventListener("change", () => {
        renderFactionAnalysis();
        if (factionVennOpen()) drawFactionVenn();
      });
    /* 两块面板（韦恩图 / 雷达图对比）都能拖底边拉伸 / 压缩高度 */
    const bindBottomResize = (panel, handle, onResize) => {
      if (!panel || !handle) return;
      handle.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        const zoom = uiZoomScale(panel) || 1;
        const startY = ev.clientY;
        const startH = panel.getBoundingClientRect().height / zoom;
        const maxH = Math.round(window.innerHeight / zoom - 120);
        document.body.classList.add("panel-resizing");
        const onMove = (e) => {
          const h = Math.max(110, Math.min(maxH, Math.round(startH + (e.clientY - startY) / zoom)));
          panel.style.height = h + "px";
          panel.style.maxHeight = h + "px";
          if (onResize) onResize(); // 图跟着一起重画 / 缩放
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.classList.remove("panel-resizing");
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    };
    bindBottomResize($("#faction-venn-panel"), $("#faction-venn-resizer"), () => {
      if (factionVennOpen()) drawFactionVenn();
    });
    bindBottomResize($("#radar-chart-panel"), $("#radar-chart-resizer"), () => {
      const panel = $("#radar-chart-panel");
      if (panel && !panel.hidden && typeof showRadarOverlay === "function") showRadarOverlay();
    });
    const factionAzBtn = $("#faction-az-btn");
    if (factionAzBtn) factionAzBtn.addEventListener("click", sortFactionsByTreeAZ);
    const relLabelsBtn = $("#rel-labels-btn");
    if (relLabelsBtn) relLabelsBtn.addEventListener("click", toggleRelLabels);
    // 「按群组」和「按势力」两栏各自一个按钮：还有没勾的就全勾上，已经全勾了再点＝全部取消
    const relPickAll = () => {
      const all = relCandidates();
      if (!all.length) return;
      const allOn = all.every((c) => relCheckedIds.has(c.id));
      relCheckedIds = allOn ? new Set() : new Set(all.map((c) => c.id));
      renderRelations();
    };
    // 「排除龙套」只在「按群组」那一栏：一次把非龙套人物勾上
    const relPickMain = () => {
      relCheckedIds = new Set(relCandidates().filter((c) => !isExtraChar(c)).map((c) => c.id));
      renderRelations();
    };
    [
      ["#rel-pick-all", relPickAll],
      ["#rel-pick-main", relPickMain],
      ["#rel-faction-all", relPickAll],
    ].forEach(([sel, fn]) => {
      const el = $(sel);
      if (el) el.addEventListener("click", fn);
    });
    // 左侧两栏的折叠开关（加粗边栏上的三角按钮）
    const relHandleGroup = $("#rel-handle-group");
    if (relHandleGroup) relHandleGroup.addEventListener("click", () => toggleRelCol("group"));
    const relHandleFaction = $("#rel-handle-faction");
    if (relHandleFaction) relHandleFaction.addEventListener("click", () => toggleRelCol("faction"));
    // 这两栏的边界也能拖：拖＝改这一栏的宽度（最小 132px），原地单击＝折叠 / 展开
    if (relHandleGroup) bindPaneResize(relHandleGroup, $("#rel-picker-col-group"), 132, 380);
    if (relHandleFaction) bindPaneResize(relHandleFaction, $("#rel-picker-col-faction"), 132, 380);
    loadRelColState();
    applyRelColState();
    loadRelFoldState();
    bindPaneToggles();
  bindSegmentListResize();
  syncTabsDivider();
  window.addEventListener("resize", syncTabsDivider);
  bindAgentAvailability();
  bindSettingsModal();
    bindSideFolds();
    $("#rel-detect-btn").addEventListener("click", detectRelations);
    $("#rel-undo-btn").addEventListener("click", undoRelationGenerate);
    $("#rel-reset-layout-btn").addEventListener("click", resetRelLayout);
    $("#rel-new-btn").addEventListener("click", () => openRelationModal(null));
    $("#relation-form").addEventListener("submit", submitRelationForm);
    // 关系弹窗里选「＋ 新建关系类型…」→ 让用户输入名字，然后选中它
    const relKindSel = $("#rel-kind");
    if (relKindSel)
      relKindSel.addEventListener("change", async () => {
        if (relKindSel.value !== "__new__") {
          relKindSel.dataset.prev = relKindSel.value;
          paintRelKindDot(relKindSel.value);
          return;
        }
        const prev = relKindSel.dataset.prev || "其他";
        const name = await addCustomRelKind();
        renderRelKindSelect(name || prev);
      });
    $("#rel-delete-btn").addEventListener("click", deleteRelation);
    $("#analyze-btn").addEventListener("click", () => {
      const t = getSelectedTask();
      // 识别出章 / 节之后、还没点过「划分章节」：先问一句要不要按识别结果建章节
      if (t && (t.segments || []).length && !t.segApplied) {
        uiChoose(
          "是否按照识别结果划分章节，然后开始分析？",
          [
            { label: "是", value: "yes", primary: true, tip: "先按识别出的章 / 节在事件轴建立章节和小节，再开始分析" },
            { label: "否，直接分析", value: "no", tip: "不建立章节，直接开始分析" },
            { label: "返回", value: "back", cancel: true, tip: "什么都不做，回到文本分析界面" },
          ],
          "划分章节"
        ).then((choice) => {
          if (!choice || choice === "back") return;
          if (choice === "yes") {
            t.segApplied = true;
            pendingUndoLabel = "按识别的章 / 节建立章节";
            const n = buildChaptersFromSegments();
            const sum = chapterStructureSummary();
            renderChapterRail();
            renderTimeline();
            renderMatrix();
            if (n) {
              uiAlert(
                `已建立 ${n} 个章节 / 小节${
                  lastPlacedCount ? `，并把 ${lastPlacedCount} 个事件归到对应的章 / 节下面` : ""
                }。`
              );
            } else {
              uiAlert(
                `没有新增：识别出的章 / 节都已经在章节结构里了。`
              );
            }
            saveState();
          }
          analyzeTask("pending");
        });
        return;
      }
      analyzeTask("pending");
    });
    const pickFailedBtn = $("#seg-pick-failed-btn");
    if (pickFailedBtn) pickFailedBtn.addEventListener("click", () => pickFailedSegments(getSelectedTask()));
    const postBtn = $("#result-summary-btn");
    if (postBtn)
      postBtn.addEventListener("click", async () => {
        if (typeof analyzeTask === "function") await analyzeTask("post");
      });
    const fillBtn = $("#fill-results-btn");
    if (fillBtn) fillBtn.addEventListener("click", fillResultsToSettings);
    $("#retry-failed-btn").addEventListener("click", () => analyzeTask("retry"));
    $("#matrix-include-extra").addEventListener("change", () => renderMatrix());
    if (typeof initMatrixCompat === "function") initMatrixCompat();
    const diagBtn = $("#diag-name-btn");
    if (diagBtn) diagBtn.addEventListener("click", diagnoseName); // 这颗按钮已经去掉了，留着兜底
    $("#merge-confirm-btn").addEventListener("click", confirmMergeDialog);
    const listAllBtn = $("#merge-list-all");
    if (listAllBtn)
      listAllBtn.addEventListener("click", () => {
        // 全选 / 全不选合成一个按钮：还有没勾的就全勾上，已经全勾了再点＝全不勾
        const boxes = checklistBoxes();
        if (!boxes.length) return;
        const allOn = boxes.every((b) => b.checked);
        boxes.forEach((b) => (b.checked = !allOn));
        updateChecklistCount();
      });
    const mergeListEl = $("#merge-list");
    if (mergeListEl) mergeListEl.addEventListener("change", updateChecklistCount);
    // 人物栏空白处：拖到某一组卡片的下方 / 空隙，就并进这一组
    const charListEl = $("#char-list");
    if (charListEl) {
      // 「落在哪一组」= 鼠标位置上方的最近一个分组标题
      const groupHeadAtY = (y) => {
        let hit = null;
        $$("#char-list .group-head").forEach((h) => {
          if (h.getBoundingClientRect().top <= y) hit = h;
        });
        return hit;
      };
      const groupEndAnchor = (headEl) => {
        if (!headEl) return null;
        const kids = Array.from(charListEl.children);
        const idx = kids.indexOf(headEl);
        for (let j = idx + 1; j < kids.length; j++) {
          if (kids[j].classList.contains("group-head")) return kids[j];
        }
        return null;
      };
      charListEl.addEventListener("dragover", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        if (ev.target.closest(".char-card, .group-head")) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        charListEl.classList.add("list-drop");
        if (data.type === "chars") return; // 整批拖动：只高亮，不预示单张插哪儿
        const anchor = groupEndAnchor(groupHeadAtY(ev.clientY));
        if (!dragPlaceholder) ensureDragPlaceholder(null);
        if (anchor) charListEl.insertBefore(dragPlaceholder, anchor);
        else charListEl.appendChild(dragPlaceholder);
      });
      charListEl.addEventListener("dragleave", (ev) => {
        if (ev.target === charListEl) charListEl.classList.remove("list-drop");
      });
      charListEl.addEventListener("drop", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        if (ev.target.closest(".char-card, .group-head")) return;
        ev.preventDefault();
        ev.stopPropagation();
        charListEl.classList.remove("list-drop");
        const head = groupHeadAtY(ev.clientY);
        const gid = head ? head.dataset.groupId || "" : "";
        if (data.type === "chars") {
          dragState = null;
          clearDragPlaceholder();
          moveCharsToGroup(data.ids, gid);
          return;
        }
        commitCharDrop(data.id);
      });
    }
    // 设定档案：在条目区空白处右键 → 全部折叠 / 全部展开
    const entryListEl = $("#entry-list");
    if (entryListEl)
      entryListEl.addEventListener("contextmenu", (ev) => {
        if (ev.target.closest(".entry-card")) return; // 卡片上的右键有自己的菜单
        ev.preventDefault();
        const cat = getCat(selectedCategoryId);
        renderContextMenu(ev.clientX, ev.clientY, cat ? `「${catDisplayName(cat)}」` : "设定条目", [
          { label: "全部折叠（只显示名字）", act: () => foldAllEntries(true) },
          { label: "全部展开（显示字段与关联）", act: () => foldAllEntries(false) },
        ]);
      });
    $("#merge-undo-btn").addEventListener("click", undoMerge);
    $("#pause-btn").addEventListener("click", togglePause);
    $("#stop-btn").addEventListener("click", stopAnalysis);
    $("#redetect-btn").addEventListener("click", async () => {
      const task = getSelectedTask();
      if (!task) return;
      if ((task.segments || []).length && !(await uiConfirm("重新识别会重置所有分段的勾选与「已分析」标记，确定继续吗？"))) return;
      rebuildSegments(task, true);
      renumberResults(task);
      saveState();
      renderFileList(task);
      renderSegments(task);
      renderResultReview(task);
      renderTaskList();
    });

    const dropzone = $("#dropzone");
    dropzone.addEventListener("click", () => $("#file-input").click());
    $("#file-input").addEventListener("change", (e) => {
      importFiles(e.target.files);
      e.target.value = "";
    });
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      importFiles(e.dataTransfer.files);
    });

    $("#new-char-btn").addEventListener("click", () => openCharacterModal(null));
    $("#new-group-btn").addEventListener("click", () => createGroup(false));
    $("#batch-btn").addEventListener("click", toggleBatchMode);
    $("#batch-apply-btn").addEventListener("click", applyBatchMove);
    const batchGroupSel = $("#batch-group");
    if (batchGroupSel)
      batchGroupSel.addEventListener("change", () => {
        // 选「＋ 新建分组…」就立刻弹窗：确定＝建组并移动，取消＝不建也不移动（不用再点「移动」）
        if (batchGroupSel.value === "__new__") applyBatchMove();
      });
    $("#batch-merge-btn").addEventListener("click", applyBatchCharacterMerge);
    const batchCopyBtn = $("#batch-copy-btn");
    if (batchCopyBtn) batchCopyBtn.addEventListener("click", batchCopyCharacters);
    const batchUpdateEventsBtn = $("#batch-update-events-btn");
    if (batchUpdateEventsBtn) batchUpdateEventsBtn.addEventListener("click", updateCharactersFromEvents);
    const batchDelBtn = $("#batch-delete-btn");
    if (batchDelBtn) batchDelBtn.addEventListener("click", batchDeleteCharacters);
    const batchPruneBtn = $("#batch-prune-btn");
    if (batchPruneBtn) batchPruneBtn.addEventListener("click", pruneThinCharacters);
    $("#batch-all-btn").addEventListener("click", batchSelectAll);
    const batchRelEditBtn = $("#batch-rel-edit-btn");
    if (batchRelEditBtn) batchRelEditBtn.addEventListener("click", editRelationBetweenSelected);
    const batchChainBtn = $("#batch-chain-btn");
    if (batchChainBtn) batchChainBtn.addEventListener("click", applyBatchChain);
    const pairRelForm = $("#pair-rel-form");
    if (pairRelForm) pairRelForm.addEventListener("submit", submitPairRelForm);
    const pairRelAdd = $("#pair-rel-add");
    if (pairRelAdd) pairRelAdd.addEventListener("click", () => addPairRelRow(null));
    $("#batch-cancel-btn").addEventListener("click", toggleBatchMode);
    $("#merge-chars-btn").addEventListener("click", mergeDuplicateCharacters);
    $("#merge-events-btn").addEventListener("click", mergeDuplicateEvents);
    // 手动合并 / 批量移动 / 批量删除 三合一：点「批量」＝进入多选（和 Shift 点多选同一个状态）
    const batchOpsBtn0 = $("#batch-ops-btn");
    if (batchOpsBtn0) batchOpsBtn0.addEventListener("click", toggleMergeSelect);
    $("#sel-delete-apply").addEventListener("click", deleteSelectedEvents);
    $("#merge-select-apply").addEventListener("click", applyManualEventMerge);
    const selCopyBtn = $("#sel-copy-apply");
    if (selCopyBtn) selCopyBtn.addEventListener("click", batchCopyEvents);
    const selAddSetBtn = $("#sel-add-event-set");
    if (selAddSetBtn) selAddSetBtn.addEventListener("click", addSelectedToEventSet);
    $("#merge-select-assign").addEventListener("click", assignSelectedToChapter);
    const mergeChapterSel = $("#merge-select-chapter");
    if (mergeChapterSel) mergeChapterSel.addEventListener("change", () => renderSectionAssignOptions());
    $("#merge-select-cancel").addEventListener("click", exitSelectMode);
    $("#sel-move-up").addEventListener("click", () => moveSelectedEvents(-1));
    $("#sel-move-down").addEventListener("click", () => moveSelectedEvents(1));
    $("#merge-select-all").addEventListener("click", selectAllVisibleEvents);
    const pickChapterBtn = $("#sel-pick-chapter");
    if (pickChapterBtn) pickChapterBtn.addEventListener("click", () => pickWholeBand("chapter"));
    const pickSectionBtn = $("#sel-pick-section");
    if (pickSectionBtn) pickSectionBtn.addEventListener("click", () => pickWholeBand("section"));
    // 批量改所属线路：点按钮开合小面板；面板内部点击不要冒泡（否则会被「点别处收起」关掉）
    const selLinesBtn = $("#sel-lines-btn");
    if (selLinesBtn)
      selLinesBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (selLinesOpen) hideSelLinesPop();
        else showSelLinesPop();
      });
    const selLinesPop = $("#sel-lines-pop");
    if (selLinesPop) {
      selLinesPop.addEventListener("click", (ev) => ev.stopPropagation());
      selLinesPop.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.target && ev.target.closest && ev.target.closest("#sel-lines-cancel")) hideSelLinesPop();
          else applySelLines();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          hideSelLinesPop();
        }
      });
    }
    const selLinesApply = $("#sel-lines-apply");
    if (selLinesApply)
      selLinesApply.addEventListener("click", (ev) => {
        ev.stopPropagation();
        applySelLines();
      });
    const selLinesAll = $("#sel-lines-all");
    if (selLinesAll)
      selLinesAll.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleSelLinesAll();
      });
    const selLinesCancel = $("#sel-lines-cancel");
    if (selLinesCancel)
      selLinesCancel.addEventListener("click", (ev) => {
        ev.stopPropagation();
        hideSelLinesPop();
      });
    const efKeyword = $("#ef-keyword");
    if (efKeyword) {
      efKeyword.addEventListener("input", () => {
        eventFilter.keyword = efKeyword.value.trim().toLowerCase();
        scheduleFilterRender("ef-keyword", renderTimeline);
      });
    }
    ["ef-char", "ef-line", "ef-chapter", "ef-narrative"].forEach((id) => {
      const el = $("#" + id);
      if (!el) return;
      el.addEventListener("change", () => {
        eventFilter.charId = $("#ef-char").value;
        eventFilter.lineId = $("#ef-line").value;
        eventFilter.chapterId = $("#ef-chapter").value;
        eventFilter.narrative = $("#ef-narrative").value;
        renderTimeline();
      });
    });
    const efClear = $("#ef-clear");
    if (efClear) {
      efClear.addEventListener("click", () => {
        eventFilter = { keyword: "", charId: "", lineId: "", chapterId: "", narrative: "" };
        if (efKeyword) efKeyword.value = "";
        const nv = $("#ef-narrative");
        if (nv) nv.value = "";
        renderEventFilters();
        renderTimeline();
      });
    }
    $("#c-new-group-btn").addEventListener("click", () => createGroup(true));
    // 人设图片：上传 / 更新 / 删除
    const portraitBtn = $("#c-image-box");
    const portraitInput = $("#c-portrait-input");
    if (portraitBtn && portraitInput) {
      portraitBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        portraitInput.click();
      });
      portraitInput.addEventListener("change", async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = "";
        if (!file) return;
        try {
          const dataUrl = await openCropper(file, 512);
          if (!dataUrl) return;
          if (dataUrl.length > 900000) {
            uiAlert("这张图片太大了，请换一张更小的。");
            return;
          }
          portraitDraft = dataUrl;
          renderPortraitField();
          setCharImageFolded(false); // 上传后展开，方便看到
          setPortraitPanel(true);
        } catch (err) {
          uiAlert("图片处理失败：" + (err && err.message ? err.message : err));
        }
      });
    }
    // 人设图栏的横向折叠条（和设定卡片的图片栏一样）
    const charImageHandle = $("#c-image-handle");
    if (charImageHandle) charImageHandle.addEventListener("click", () => setCharImageFolded(!charImageFolded));
    // 裁剪窗口：确定 / 取消，以及拖动虚线框
    const cropBox = $("#crop-box");
    if (cropBox) cropBox.addEventListener("pointerdown", onCropPointerDown);
    const cropOk = $("#crop-ok");
    if (cropOk) cropOk.addEventListener("click", applyCrop);
    const cropCancel = $("#crop-cancel");
    if (cropCancel) cropCancel.addEventListener("click", cancelCrop);
    const cropClose = $("#crop-close");
    if (cropClose) cropClose.addEventListener("click", cancelCrop);
    const cropModal = $("#crop-modal");
    if (cropModal)
      cropModal.addEventListener("click", (ev) => {
        // 点遮罩空白处 = 取消；但「刚拖完裁剪框、松手落在遮罩上」补的那一下 click 不算
        if (ev.target !== cropModal || !cropState) return;
        if (Date.now() - cropDragAt < 250) return;
        cancelCrop();
      });
    // 裁剪窗口：Enter＝确认裁剪并关闭；Esc＝取消，不保存
    document.addEventListener(
      "keydown",
      (ev) => {
        if (!cropState || !cropModal || cropModal.hidden) return;
        if (ev.key === "Enter") {
          ev.preventDefault();
          ev.stopPropagation();
          applyCrop();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          cancelCrop();
        }
      },
      true
    );
    // 缩略图旁边的小 × ：直接删掉人设图
    const charImageDel = $("#c-image-del");
    if (charImageDel) {
      charImageDel.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        portraitDraft = "";
        renderPortraitField();
        setPortraitPanel(false);
      });
    }
    const portraitClose = $("#c-portrait-close");
    if (portraitClose) portraitClose.addEventListener("click", () => setPortraitPanel(false));
    const portraitUpload = $("#c-portrait-upload");
    if (portraitUpload && portraitInput) {
      portraitUpload.addEventListener("click", (ev) => {
        ev.preventDefault();
        portraitInput.click();
      });
    }
    const portraitRemove = $("#c-portrait-remove");
    if (portraitRemove) {
      portraitRemove.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        portraitDraft = "";
        renderPortraitField();
      });
    }
    // 「＋ 新建势力」跟着展开出来那排势力胶囊走（在 renderCharFactionPool 里挂），这里不再单独绑
    const factionFoldBtn = $("#c-faction-fold");
    if (factionFoldBtn) factionFoldBtn.addEventListener("click", () => setFactionPoolFold(!factionPoolFolded));
    const fieldsFoldBtn = $("#c-fields-fold");
    if (fieldsFoldBtn) {
      const toggleFieldsFold = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setFieldsFolded("char", !fieldsFolded.char);
      };
      fieldsFoldBtn.addEventListener("click", toggleFieldsFold);
      fieldsFoldBtn.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") toggleFieldsFold(ev);
      });
    }
    const fieldsExpandBtn = $("#c-fields-expand");
    if (fieldsExpandBtn)
      fieldsExpandBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setFieldsFolded("char", false);
      });
    const eventFieldsFoldBtn = $("#e-fields-fold");
    if (eventFieldsFoldBtn) {
      const toggleEventFieldsFold = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setFieldsFolded("event", !fieldsFolded.event);
      };
      eventFieldsFoldBtn.addEventListener("click", toggleEventFieldsFold);
      eventFieldsFoldBtn.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") toggleEventFieldsFold(ev);
      });
    }
    const eventFieldsExpandBtn = $("#e-fields-expand");
    if (eventFieldsExpandBtn)
      eventFieldsExpandBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setFieldsFolded("event", false);
      });
    const addCharFieldBtn = $("#c-add-field");
    if (addCharFieldBtn) addCharFieldBtn.addEventListener("click", addCharFieldRow);
    const addEventFieldBtn = $("#e-add-field");
    if (addEventFieldBtn) addEventFieldBtn.addEventListener("click", addEventFieldRow);
    const entryCharFoldBtn = $("#entry-char-fold");
    if (entryCharFoldBtn) entryCharFoldBtn.addEventListener("click", () => setEntryCharPoolFold(!entryCharPoolFolded));
    const eventCharFoldBtn = $("#event-char-fold");
    if (eventCharFoldBtn) eventCharFoldBtn.addEventListener("click", () => setEventCharPoolFold(!eventCharPoolFolded));
    const refreshModelsBtn = $("#agent-refresh-models");
    if (refreshModelsBtn) refreshModelsBtn.addEventListener("click", () => refreshAgentModels(true, false));
    // 设定条目的图片：上传 / 更新 / 删除
    const enImageBtn = $("#en-image-box");
    const enImageInput = $("#en-image-input");
    if (enImageBtn && enImageInput) {
      enImageBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        enImageInput.click();
      });
    }
    if (enImageInput) {
      enImageInput.addEventListener("change", async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = "";
        if (!file) return;
        try {
          const dataUrl = await openCropper(file, 512);
          if (!dataUrl) return;
          if (dataUrl.length > 900000) {
            uiAlert("这张图片太大了，请换一张更小的。");
            return;
          }
          entryImageDraft = dataUrl;
          renderEntryImageField();
          setEntryImageFolded(false); // 上传后展开，方便看到
          setEntryImagePanel(true);
        } catch (err) {
          uiAlert("图片处理失败：" + (err && err.message ? err.message : err));
        }
      });
    }
    const enImageClose = $("#en-image-close");
    if (enImageClose) enImageClose.addEventListener("click", () => setEntryImagePanel(false));
    // 图片栏的横向折叠条
    const enImageHandle = $("#entry-image-handle");
    if (enImageHandle) enImageHandle.addEventListener("click", () => setEntryImageFolded(!entryImageFolded));
    const enImageUpload = $("#en-image-upload");
    if (enImageUpload && enImageInput) {
      enImageUpload.addEventListener("click", (ev) => {
        ev.preventDefault();
        enImageInput.click();
      });
    }
    const enImageRemove = $("#en-image-remove");
    if (enImageRemove) {
      enImageRemove.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        entryImageDraft = "";
        renderEntryImageField();
      });
    }
    // 缩略图旁边的小 × ：直接删掉图片（和面板里的「删除图片」等效）
    const enImageDel = $("#en-image-del");
    if (enImageDel) {
      enImageDel.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        entryImageDraft = "";
        renderEntryImageField();
        setEntryImagePanel(false);
      });
    }
    const newLineBtn0 = $("#new-line-btn");
    if (newLineBtn0) newLineBtn0.addEventListener("click", () => openLineModal(null));
    $("#new-event-btn").addEventListener("click", () => {
      const place = centerPlaceForNewEvent();
      pendingEventPlace = place || null;
      openEventModal(null);
    });
    // 记下每个输入框「获得焦点时的内容」：Ctrl+Z 用它判断该撤销文本还是撤销工作区操作
    document.addEventListener(
      "focusin",
      (ev) => {
        const el = ev.target;
        if (!el || !/^(INPUT|TEXTAREA)$/.test((el.tagName || "").toUpperCase())) return;
        el.__focusVal = el.value;
      },
      true
    );
    $$(".js-undo").forEach((btn) => btn.addEventListener("click", () => undoTimeline()));
    $$(".js-redo").forEach((btn) => btn.addEventListener("click", () => redoTimeline()));
    document.addEventListener("keydown", (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      /* 弹窗开着的时候，Ctrl+Z / Ctrl+Y 只归弹窗自己管（设置界面有自己的撤销栈；
         输入框里的文字用系统撤销）——快捷键统一只作用最上面那一层，别去动底下的工作区。 */
      if (anyModalOpen()) return;
      const t = ev.target;
      const tag = (t && t.tagName) || "";
    // 光标在输入框里时：只有「这一格确实改过内容」才让浏览器做文本撤销；
    // 没改过（或只是焦点停在这）就把 Ctrl+Z / Ctrl+Y 交给工作区的撤销 ——
    // 否则用户点完输入框再按 Ctrl+Z，会觉得「撤销不管用」。
    const editing =
      (/^(INPUT|TEXTAREA)$/.test(tag) || (t && t.isContentEditable)) &&
      String(t.value || "") !== String(t.__focusVal == null ? t.value : t.__focusVal);
    if (editing) return;
      const key = String(ev.key || "").toLowerCase();
      if (key === "z" && !ev.shiftKey) {
        ev.preventDefault();
        undoTimeline();
      } else if (key === "y" || (key === "z" && ev.shiftKey)) {
        ev.preventDefault();
        redoTimeline();
      }
    });
    // 事件轴容器上的空白（比如所有时间行下方的大片空区）：右键也能直接加事件
    const tlEl = $("#timeline");
    if (tlEl) {
      tlEl.addEventListener("contextmenu", (ev) => {
        if (ev.target.closest(".evaxis-row, .evaxis-band, .evaxis-insert, .event-card, .chapter-divider, .lane-head")) return;
        ev.preventDefault();
        // 先按鼠标的纵向位置找到对应的时间行（事件轴右侧的空白也适用）
        const row = nearestAxisRow(ev.clientY, 80);
        if (row) {
          const grid = $("#timeline .evaxis-grid");
          showRowMenu(
            ev.clientX,
            ev.clientY,
            parseInt(row.dataset.row, 10),
            parseFloat(row.dataset.value),
            laneIdFromX(grid, ev.clientX)
          );
          markContextTarget(row);
          return;
        }
        const laneId = lineFilterDefaultId();
        renderContextMenu(ev.clientX, ev.clientY, "事件轴空白处", [
          { label: "新建事件（放到最后）", act: () => startNewEventAt(null, laneId) },
          ...foldMenuItems(),
        ]);
      });
    }
    $("#new-cat-btn").addEventListener("click", () => openCatModal(null));
    bindMapPanel(); // 地图（设定档案 → 地点）里那几个固定按钮
    bindTreePanel(); // 拓扑栏（设定档案 → 勾了「树型拓扑」的类别）的拖拽 / 菜单 / 批量
    bindPedigree(); // 系谱（人物分析 → 系谱）的搜索框等固定绑定
    bindPedigreeFit(); // 系谱画布的自适应缩放：边栏拖宽 / 窗口变化时跟着重算
    $("#new-entry-btn").addEventListener("click", () => openEntryModal(null));
    $("#entry-batch-btn").addEventListener("click", toggleEntryBatch);
    const entryMergeBtn = $("#entry-batch-merge");
    if (entryMergeBtn) entryMergeBtn.addEventListener("click", entryBatchMerge);
    const entryCopyBtn = $("#entry-batch-copy");
    if (entryCopyBtn) entryCopyBtn.addEventListener("click", batchCopyEntries);
    const entryAutoMergeBtn = $("#entry-auto-merge-btn");
    if (entryAutoMergeBtn) entryAutoMergeBtn.addEventListener("click", () => mergeDuplicateEntries(selectedCategoryId));
    // 抬头上的「清理超短条目」＝清理当前这一类（右键菜单里那一条是同一个动作）
    const entryHeadPruneBtn = $("#entry-prune-btn");
    if (entryHeadPruneBtn) entryHeadPruneBtn.addEventListener("click", () => pruneThinEntriesInCategory(selectedCategoryId));
    const entryPruneBtn = $("#entry-batch-prune");
    if (entryPruneBtn) entryPruneBtn.addEventListener("click", pruneThinEntries);
    $("#entry-new-group-btn").addEventListener("click", createSettingGroup);
    $("#entry-batch-move").addEventListener("click", entryBatchMove);
    const entryBatchCatMoveBtn = $("#entry-batch-cat-move");
    if (entryBatchCatMoveBtn) entryBatchCatMoveBtn.addEventListener("click", entryBatchMoveCat);
    $("#entry-batch-delete").addEventListener("click", entryBatchDelete);
    $("#entry-batch-all").addEventListener("click", entryBatchSelectAll);
    $("#entry-batch-cancel").addEventListener("click", toggleEntryBatch);
    $("#char-search").addEventListener("input", () => scheduleFilterRender("char-search", renderCharacters));
    $("#entry-search").addEventListener("input", () => scheduleFilterRender("entry-search", renderEntries));
    // 搜索框里按 Esc＝清空（Windows 习惯）；框里本来就是空的时候，交给全局 Esc（关弹窗 / 退出多选）
    const escClear = (sel, after) => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape" || !el.value) return;
        // 搜索框里按 Esc：如果批量还开着，先让全局 Esc 退出批量；
        // 批量退出后再按一次，才清空搜索。
        if (batchMode || entryBatchMode || mergeSelectMode) return;
        ev.preventDefault();
        ev.stopPropagation();
        el.value = "";
        after();
      });
    };
    escClear("#char-search", renderCharacters);
    escClear("#entry-search", renderEntries);
    escClear("#ef-keyword", () => {
      eventFilter.keyword = "";
      renderTimeline();
    });
    const entrySortBtn = $("#entry-sort-btn");
    if (entrySortBtn) entrySortBtn.addEventListener("click", sortEntriesByInitial);
    const entryHierSortBtn = $("#entry-hier-sort-btn");
    if (entryHierSortBtn) entryHierSortBtn.addEventListener("click", sortEntriesByFactionTree);
    /* 人物卡「所属势力」的「▾」：开级联选择面板（可连着点几条，加了就进池子） */
    const charFactionPick = $("#c-faction-pick");
    if (charFactionPick)
      charFactionPick.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (factionPickPanelOpen()) {
          closeFactionPickPanel(); // 再点一下＝收起
          return;
        }
        openFactionPickPanel({
          anchor: charFactionPick,
          pickedId: "",
          maxLevel: 3, // 人物可以直接属于三级势力
          onPick: (id) => {
            if (!id) return;
            const en = factionEntryById(id);
            if (!en) return;
            if (!charFactionSel.has(id)) {
              // 勾子级＝把链上的上级取消掉；点上面那条时，它下面已勾的子级也一起灭掉
              //（同一条链上只留点中的那一条）
              factionChainOf(en).forEach((x) => charFactionSel.delete(x.id));
              factionDescendantsOf(en).forEach((x) => charFactionSel.delete(x.id));
              charFactionSel.add(id);
            }
            factionPoolExpanded.add(id); // 从面板加进来的那条就地摊开
            setFactionPoolFold(false); // 加了就展开，方便看到
            renderCharFactionPool(Array.from(charFactionSel));
          },
        });
      });

    $("#char-form").addEventListener("submit", submitCharacterForm);
    bindRadarChart();
    $("#event-form").addEventListener("submit", submitEventForm);
    bindEventAutoComplete();
    $("#line-form").addEventListener("submit", submitLineForm);
    $("#cat-form").addEventListener("submit", submitCatForm);
    $("#entry-form").addEventListener("submit", submitEntryForm);

    $("#char-delete-btn").addEventListener("click", deleteCharacter);
    $("#event-delete-btn").addEventListener("click", deleteEvent);
    $("#line-delete-btn").addEventListener("click", deleteLine);
    $("#cat-delete-btn").addEventListener("click", () => {
      deleteCat($("#cat-id").value);
      closeModal("cat-modal");
    });
    $("#entry-delete-btn").addEventListener("click", deleteEntry);
    $("#entry-to-char-btn").addEventListener("click", () => convertFactionBackToCharacter($("#entry-id").value));

    $("#entry-add-field").addEventListener("click", () => {
      const box = $("#entry-fields");
      const row = document.createElement("div");
      row.className = "entry-field-row";
      row.innerHTML = `<input type="text" class="ef-label" placeholder="字段名" /><textarea class="ef-value" rows="1" placeholder="内容"></textarea><button type="button" class="icon-btn ef-del" title="删除字段">×</button>`;
      box.appendChild(row);
      row.querySelector(".ef-del").addEventListener("click", () => {
        row.remove();
        if (!box.querySelector(".entry-field-row")) renderEntryFields([{ label: "", value: "" }]);
      });
    });

    $("#l-kind").addEventListener("change", toggleParentVisibility);

    $("#export-btn").addEventListener("click", exportJSON);
    $("#history-save-btn").addEventListener("click", saveVersion);
    const clearHistoryBtn = $("#history-clear-btn");
    if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", clearAllHistory);
    const importBtn = $("#import-btn");
    if (importBtn)
      importBtn.addEventListener("click", async () => {
        const picked = await pickImportFile();
        if (picked === null) {
          // 没设默认位置 / 接口不可用：退回原来的「选文件」方式
          const inp = $("#import-input");
          if (inp) inp.click();
          return;
        }
        if (!picked) return; // 用户取消
        importJSON(picked);
      });
    $("#import-input").addEventListener("change", (e) => {
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });
    $("#help-btn").addEventListener("click", () => openModal("help-modal"));

    // 只绑主区那排页签：别把「文本分析结果」里新加的选项卡（也是 .tab 美术）一起绑走
    $$("#tabs .tab[data-tab]").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

    $$(".modal-overlay").forEach((ov) =>
      ov.addEventListener("mousedown", (e) => {
        if (e.target !== ov) return;
        /* 裁剪窗不在这里关：它有自己那套「点遮罩＝取消」（还要躲开拖完裁剪框那一下），
           两边都管会互相打架 —— 拖一下就把裁剪窗关掉、上传看着像被提交了。 */
        if (ov.id === "crop-modal") return;
        // 刚打开的弹窗（300ms 内）不响应遮罩点击：习惯性双击卡片时，第二下会落在刚弹出的遮罩上
        if (Date.now() - modalOpenedAt < 300) return;
        closeModal(ov.id);
      })
    );
    // 编辑类弹窗提交表单用的选择器；× / Esc 只负责关闭（不保存），Ctrl+S 才提交。
    const SAVE_CLOSE_FORMS = {
      "char-modal": "#char-form",
      "event-modal": "#event-form",
      "line-modal": "#line-form",
      "cat-modal": "#cat-form",
      "map-modal": "#map-form",
      "map-scale-modal": "#map-scale-form",
      "map-coord-modal": "#map-coord-form",
      "entry-modal": "#entry-form",
      "relation-modal": "#relation-form",
      "pair-rel-modal": "#pair-rel-form",
    };
    // 所有带 data-close 的按钮都能关弹窗：
    //   右上角的 ×（.modal-close）＝直接关闭，不保存
    //   底部的「取消 / 关闭 / 知道了」＝直接关闭，不保存
    // 编辑类弹窗要保存时：点弹窗里的「保存」按钮，或按 Ctrl+S。
    $$(".modal-close[data-close]").forEach((btn) => {
      if (!btn.title) btn.title = "关闭（不保存）";
    });
    function submitModalForm(id) {
      const form = SAVE_CLOSE_FORMS[id] ? $(SAVE_CLOSE_FORMS[id]) : null;
      if (form && typeof form.requestSubmit === "function") form.requestSubmit();
      else closeModal(id);
    }
    // 编辑弹窗底部的「保存」＝保存并关闭（以前这里把它当成「只保存不关」，
    // 于是点了保存弹窗不关）。想「只保存不关」用 Ctrl+S。
    function closeModalDiscard(id) {
      closeModal(id);
    }
    $$("[data-close]").forEach((btn) =>
      btn.addEventListener("click", (ev) => {
        const id = btn.dataset.close;
        if (btn.classList.contains("modal-close")) ev.preventDefault();
        ev.stopPropagation();
        closeModalDiscard(id);
      })
    );
    /* 输入框里按回车＝把这一格的内容记下、光标移出输入框（不触发 <form> 提交，也就不会顺手保存并关掉弹窗）
       例外：人物信息里雷达图数值框回车＝记下数值并直接画图 */
    /* Ctrl+Enter（Mac：Cmd+Enter）＝在输入框里换行。
       多行框（文本域 / 可编辑区）在光标处插一个换行符；单行框放不下换行，就只当它「不是回车」，
       既不保存也不关弹窗——免得用户想换行，反而把整个弹窗提交了。 */
    function insertLineBreakAtCaret(el) {
      if (!el) return;
      const editable = el.isContentEditable ? el : el.closest && el.closest('[contenteditable="true"]');
      try {
        // 走 execCommand：能进浏览器自己的撤销栈，也会正常派发 input 事件
        if (editable && document.execCommand("insertLineBreak")) return;
        if (document.execCommand("insertText", false, "\n")) return;
      } catch (e) {
        /* 下面的兜底插入 */
      }
      if (editable) return;
      const start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
      const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
      el.value = el.value.slice(0, start) + "\n" + el.value.slice(end);
      try {
        el.setSelectionRange(start + 1, start + 1);
      } catch (e) {
        /* ignore */
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    document.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key !== "Enter" || !(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
        const t = ev.target;
        if (!t) return;
        const tag = String(t.tagName || "").toUpperCase();
        const editable = tag === "TEXTAREA" || t.isContentEditable || !!(t.closest && t.closest('[contenteditable="true"]'));
        if (editable) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          insertLineBreakAtCaret(t);
          return;
        }
        if (tag === "INPUT") {
          const type = String(t.type || "text").toLowerCase();
          if (/^(checkbox|radio|button|submit|reset|file|color|range)$/.test(type)) return;
          // 单行框里换行放不下：吞掉这次 Ctrl+Enter，别让它当成「保存 / 确认」
          ev.stopImmediatePropagation();
        }
      },
      true
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if (e.isComposing || e.keyCode === 229) return; // 输入法组字中
        const t = e.target;
        if (!t || t.tagName !== "INPUT") return;
        const type = String(t.type || "text").toLowerCase();
        if (/^(checkbox|radio|button|submit|reset|file|color|range)$/.test(type)) return;
        // 小弹窗 / 菜单（输入框 + 确定）里回车是「确定」，交给它们自己
        if (t.closest && t.closest("#ui-prompt-modal, #ui-confirm-modal, .context-menu, #merge-modal")) return;
        if (document.querySelector(".context-menu:not([hidden])")) return;
        e.preventDefault();
        // 雷达图现在是边填边画，回车只管「确认输入、移出光标」
        // 等这一轮事件走完再失焦：自动补全之类的处理器可能刚把推荐值填进去并把焦点抢回来
        setTimeout(() => {
          if (typeof t.blur === "function") t.blur();
        }, 0);
      },
      true
    );
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        const open = $$(".modal-overlay:not([hidden])");
        const editing = open.find((ov) => SAVE_CLOSE_FORMS[ov.id]);
        if (editing) {
          e.preventDefault();
          e.stopPropagation();
          saveKeepOpen = true; // Ctrl+S＝只保存不关
          submitModalForm(editing.id);
          return;
        }
        // 全局设置：Ctrl+S ＝ 只保存不关
        const setMod = $("#settings-modal");
        if (setMod && !setMod.hidden) {
          e.preventDefault();
          e.stopPropagation();
          saveSettingsModal({ keepOpen: true });
          return;
        }
        /* 其余情况（主界面 / 普通提示弹窗）：只挡住浏览器自己的「保存网页」。
           主界面里那次「保存当前工作区」由下面 onShortcutKeydown 那条 Ctrl+S 做
           —— 两边都在 document 上，stopPropagation 拦不住同一个节点上的监听器，
           这里再调一次会存两遍（弹两次「已保存」）。 */
        e.preventDefault();
        return;
      }
      // 光标不在输入框里时，回车＝保存 / 确认并关闭当前弹窗
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.isComposing || e.keyCode === 229) return;
        const t = e.target;
        const tag = (t && t.tagName) || "";
        /* 输入框里回车＝把这一格记下 + 移出光标（上面那个处理器管）；
           按钮 / 下拉 / 链接自己认回车。勾选框、颜色、滑块这类「回车本来没有作用」的输入
           放行，让回车继续走到下面「确认 / 保存并关闭弹窗」的逻辑 —— 在合并清单里
           用鼠标勾完几条再按回车，就是这个用法。 */
        const inputType = String((t && t.type) || "text").toLowerCase();
        // 弹窗里的按钮自己认回车；焦点还留在「点开弹窗的那颗按钮」上时不要放行，
        // 否则回车会去再点它一次（弹窗刚开就被同一个按钮再触发一遍）
        const inOpenModal = !!(t && t.closest && t.closest(".modal-overlay:not([hidden])"));
        const eatsEnter =
          tag === "TEXTAREA" ||
          !!(t && t.isContentEditable) ||
          (inOpenModal && /^(BUTTON|A|OPTION|SELECT)$/.test(tag)) ||
          (!inOpenModal && /^(OPTION|SELECT)$/.test(tag)) ||
          (tag === "INPUT" && !/^(checkbox|radio|color|range|file)$/.test(inputType));
        /* 地图相关弹窗（编辑地图 / 坐标 / 比例尺）里的单行输入框按回车＝保存并关闭。
           放在 eatsEnter 之前：这类输入框原本会吃掉回车，浏览器又不一定帮我们提交表单
           （焦点 / 样式都会影响），所以在这里兜住。只作用于地图这几个，别的弹窗行为不变。 */
        const MAP_ENTER_FORMS = { "map-modal": 1, "map-coord-modal": 1, "map-scale-modal": 1 };
        if (tag === "INPUT") {
          const openNow = $$(".modal-overlay:not([hidden])");
          const topNow = openNow[openNow.length - 1];
          if (topNow && MAP_ENTER_FORMS[topNow.id]) {
            e.preventDefault();
            e.stopPropagation();
            saveKeepOpen = false; // Enter＝保存并关闭
            submitModalForm(topNow.id);
            return;
          }
        }
        if (eatsEnter) return;
        if (document.querySelector(".context-menu:not([hidden])")) return;
        /* 程序自带的浮层（下拉选项面板 / 势力「所属」级联面板）开着时，
           回车归它们：不然在下拉里选一项，回车会顺手把信息卡保存关掉。 */
        if (document.querySelector(".ui-select-panel")) return;
        if (factionPickPanelOpen()) return;
        /* 韦恩图开着：回车＝生成（和别的弹窗一个规矩） */
        if (factionVennOpen()) {
          const go = $("#faction-venn-go");
          if (go) {
            ev.preventDefault();
            ev.stopPropagation();
            go.click();
          }
          return;
        }
        const open = $$(".modal-overlay:not([hidden])");
        if (!open.length) return;
        const top = open[open.length - 1];
        if (top.id === "ui-prompt-modal" || top.id === "ui-confirm-modal") return; // 它们自己认回车
        e.preventDefault();
        e.stopPropagation();
        if (top.id === "ui-alert-modal") {
          const ok = $("#ui-alert-ok");
          if (ok) ok.click();
          return;
        }
        // 合并 / 清理这类「勾选清单」弹窗：回车＝确认（按钮是弹窗底部那个确认键）
        if (top.id === "merge-modal") {
          const ok = $("#merge-confirm-btn");
          const cand = ok && !ok.disabled ? ok : top.querySelector(".modal-foot .btn-primary:not([disabled])");
          if (cand) cand.click();
          return;
        }
        if (top.id === "settings-modal") {
          saveSettingsModal();
          return;
        }
        if (SAVE_CLOSE_FORMS[top.id]) {
          saveKeepOpen = false; // Enter＝保存并关闭
          submitModalForm(top.id);
          return;
        }
        if (top.id === "help-modal") {
          const ok = top.querySelector('[data-close="help-modal"]');
          if (ok) ok.click();
        }
        return;
      }
      if (e.key !== "Escape") return;
      // 1) 右键菜单盖在弹窗上面：先收菜单
      if (document.querySelector(".context-menu:not([hidden])")) {
        hideContextMenu();
        return;
      }
      /* 1.5) 程序自带的浮层盖在弹窗上面：Esc 只关最上面那一层
         （下拉选项面板 / 势力「所属」级联面板），别把整个信息卡一起取消掉 */
      if (factionVennOpen()) {
        hideFactionVenn();
        return;
      }
      if (factionPickPanelOpen()) {
        closeFactionPickPanel();
        return;
      }
      if (document.querySelector(".ui-select-panel")) {
        uiCloseSelectPanel();
        return;
      }
      // 2) 有弹窗就关最上面那一层：和点右上角的 × 一样，直接关闭、不保存；要保存按 Ctrl+S
      //    （图层顺序＝DOM 顺序，数组里最后一个就在最上面；叠了两层时只关上面那层）
      const open = $$(".modal-overlay:not([hidden])");
      if (open.length) {
        closeModalDiscard(open[open.length - 1].id);
        return;
      }
      // 2.5) 「批量改所属线路」小面板开着就先收起它
      if (selLinesOpen) {
        hideSelLinesPop();
        return;
      }
      // 2.6) 雷达分析的叠加图开着：Esc = 点右上角的 ×
      if (viewVisible("view-radar")) {
        const panel = $("#radar-chart-panel");
        if (panel && !panel.hidden) {
          e.preventDefault();
          hideRadarOverlay();
          return;
        }
      }
      // 3) 都没有：退出多选（Esc 退出）
      //    即使焦点在下拉框 / 搜索框里，也优先退出批量状态。
      if (shortcutExitSelectModes()) {
        e.preventDefault();
        return;
      }
      if (clearActiveSearchFilters()) {
        e.preventDefault();
        return;
      }
      if (isTypingTarget(e.target)) return;
    });
    document.addEventListener("click", (ev) => {
      // 点在菜单自己身上（含滚动条）不要把菜单关掉，交给菜单项自己处理
      if (ev.target && ev.target.closest && ev.target.closest(".context-menu")) return;
      hideContextMenu();
      // 点别处收起「批量改所属线路」小面板
      if (selLinesOpen && !(ev.target && ev.target.closest && ev.target.closest(".sel-lines"))) hideSelLinesPop();
    });
    // 多选收敛用「捕获阶段」监听：卡片自己的点击处理常常 stopPropagation，
    // 放在冒泡阶段会漏掉。capture 一定先跑，点空白退出多选、点别的界面退出（Ctrl/Shift 时切过去）。
    document.addEventListener("click", (ev) => handleBatchClickOutside(ev), true);
    window.addEventListener(
      "scroll",
      (ev) => {
        // 菜单内部滚动（鼠标滚轮 / 拖滑条）时不要关掉菜单
        const t = ev.target;
        if (t && t.closest && t.closest(".context-menu")) return;
        hideContextMenu();
      },
      true
    );
    // 弹窗里滚动时，人名的悬浮说明跟着收起来，免得飘在错的位置
    window.addEventListener("scroll", () => hideNameTip(true), true);
    // 窗口大小变了就重算事件轴列宽（自适应），列宽没变就不重画
    let laneResizeTimer = null;
    window.addEventListener("resize", () => {
      if (laneResizeTimer) clearTimeout(laneResizeTimer);
      laneResizeTimer = setTimeout(() => {
        laneResizeTimer = null;
        invalidateAxisWidth();
        const COLS = lineFilterLanes().length;
        if (!COLS) return;
        if (Math.abs(laneWidthFor(COLS) - lastLaneWidth) < 2) return;
        renderTimeline();
      }, 160);
    });
    window.addEventListener("beforeunload", (e) => {
      // 离开页面前把还没落盘的改动立刻写一遍（localStorage 同步；IndexedDB 尽力而为）
      if (localSaveTimer) {
        clearTimeout(localSaveTimer);
        localSaveTimer = null;
        persistProjectsLocalNow();
      }
      if (idbSaveTimer) {
        clearTimeout(idbSaveTimer);
        idbSaveTimer = null;
        idbSet(IDB_PROJECTS_KEY, projectsPayload()).catch(() => {});
      }
    });
  }

  function renderAll() {
    batchMode = false;
    batchSelected = new Set();
    mergeSelectMode = false;
    mergeSelected = new Set();
    entryBatchMode = false;
    entryBatchSel = new Set();
    poolCollapsed = null;
    charPoolSel.clear();
    hideMergeUndoBar();
    renderProjectSelect();
    renderChapterRail();
    renderEventFilters();
    statsSelectedCharId = null;
    relSelectedCharId = null;
    relFocusIds = new Set();
    relKindFilters = new Set();
    hideRelUndoBar();
    renderStats();
    renderFactionAnalysis();
    renderRelations();
    renderPedigree(); // 系谱：撤销 / 恢复之后画布也要跟着回滚（不然数据回滚了、画面还停在上一步）
    renderMergeSelectBar();
    renderCharacters();
    refreshLineViews();
    renderCategories();
    renderEntries();
    renderManageLists();
    renderTaskList();
    renderTaskDetail();
    if (typeof refreshNovelOutlineIfVisible === "function") refreshNovelOutlineIfVisible();
  }

  /* ================= 快捷键 =================
     Shift+单击＝连选区间（像资源管理器）；Ctrl/Cmd+单击＝加选 / 减选
     Delete＝删除选中（人物 / 设定 / 事件卡片都不弹二次确认，随时 Ctrl+Z 撤销）
     Ctrl/Cmd+A＝全选当前可见；Enter＝打开选中项的编辑弹窗；Ctrl/Cmd+F＝跳到搜索框
     Shift+↑/↓＝已取消（容易误触；整组上移 / 下移请在批量条上点按钮）
  */
  let lastPaneTag = "event"; // 最近操作过的栏目：event / matrix / char / entry / result
  const SHORTCUT_SEL = {
    event: { anchor: null, base: null },
    matrix: { anchor: null, base: null },
    char: { anchor: null, base: null },
    entry: { anchor: null, base: null },
    result: { anchor: null, base: null },
    radar: { anchor: null, base: null },
    faction: { anchor: null, base: null },
  };

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = String(el.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
  }

  function anyModalOpen() {
    return !!document.querySelector(".modal-overlay:not([hidden])");
  }

  function viewVisible(id) {
    const el = document.getElementById(id);
    return !!(el && !el.hidden);
  }

  function currentViewName() {
    if (viewVisible("view-novel")) return "novel";
    if (viewVisible("view-matrix")) return "matrix";
    if (viewVisible("view-chrono")) return "chrono";
    if (viewVisible("view-settings")) return "settings";
    if (viewVisible("view-analysis")) return "analysis";
    if (viewVisible("view-stats")) return "stats";
    if (viewVisible("view-faction")) return "faction";
    if (viewVisible("view-radar")) return "radar";
    if (viewVisible("view-relations")) return "relations";
    return "timeline";
  }

  function paneUsable(pane) {
    const v = currentViewName();
    /* 人物边栏：只有真的露在当前页签上（没被页签藏起来、也没被折叠）才算 */
    if (pane === "char") {
      const list = document.getElementById("char-list");
      return !!(list && list.offsetParent);
    }
    if (pane === "entry") return v === "settings";
    if (pane === "result") return v === "analysis";
    if (pane === "seg") return v === "analysis"; // 文本分析里的「章节 / 小节」列表
    if (pane === "radar") return v === "radar"; // 雷达分析：要画雷达的那些人物行
    if (pane === "faction") return v === "faction"; // 势力分析：表里的势力行
    if (pane === "matrix") return v === "matrix";
    if (pane === "novel") return v === "novel";
    if (pane === "event") return v === "timeline" || v === "chrono"; // 时间线上的卡片也是事件
    return false;
  }

  /* 一个页签里，Ctrl+A / 方向键 / Enter 默认作用在哪个列表上
     （没点过、鼠标也不在任何列表里时的兜底） */
  function defaultShortcutPaneForView(v) {
    if (v === "matrix") return "matrix";
    if (v === "novel") return "novel";
    if (v === "settings") return "entry";
    if (v === "analysis") return "result";
    if (v === "radar") return "radar";
    if (v === "faction") return "faction"; // 势力分析：默认作用在表里的势力行（左栏人物另算）
    if (v === "timeline" || v === "chrono") return "event";
    return "char"; // 出场统计 / 势力分析 / 关系网：左栏人物
  }

  /* 指针停在哪个列表上（鼠标位置定"当前界面在操作哪一个列表"）。
     只认当前可见的元素：elementFromPoint 不会返回被隐藏的东西。 */
  let shortcutPointer = null;
  document.addEventListener(
    "mousemove",
    (ev) => {
      shortcutPointer = { x: ev.clientX, y: ev.clientY };
    },
    true
  );
  function paneAtPointer() {
    if (!shortcutPointer) return "";
    const el = document.elementFromPoint(shortcutPointer.x, shortcutPointer.y);
    if (!el || !el.closest) return "";
    // 越具体的列表越优先（同一个页签里可能有好几个列表：分析结果 / 章节小节、雷达行 / 人物边栏…）
    for (const p of ["seg", "radar", "faction", "result", "entry", "char", "matrix", "novel", "event"]) {
      const sel = paneCardSelector(p);
      if (sel && el.closest(sel)) return p;
    }
    return "";
  }

  function activeShortcutPane() {
    const hover = paneAtPointer();
    if (hover && paneUsable(hover)) return hover;
    if (paneUsable(lastPaneTag)) return lastPaneTag;
    return defaultShortcutPaneForView(currentViewName());
  }

  // 从 a 到 b 之间的所有项（按当前显示顺序）
  function rangeIdsBetween(ids, a, b) {
    const ia = ids.indexOf(a);
    const ib = ids.indexOf(b);
    if (ia < 0 || ib < 0) return [b];
    const lo = Math.min(ia, ib);
    const hi = Math.max(ia, ib);
    return ids.slice(lo, hi + 1);
  }

  // 事件轴 / 二维事件图里可见的事件（按叙事顺序）
  function visibleEventIdsForShortcut() {
    return visibleEvents().map((e) => e.id);
  }
  function visibleCharIdsForShortcut() {
    const dom = $$("#char-list .char-card").map((el) => el.dataset.charId);
    return dom.length ? dom : lastFilteredCharIds.slice();
  }
  function visibleEntryIdsForShortcut() {
    return $$("#entry-list .entry-card").map((el) => el.dataset.entryId);
  }
  /* 势力分析表里真正画出来的那些势力行（折叠藏起来的不算） */
  function factionVisibleIds() {
    return $$(".faction-table tr[data-faction-row]")
      .map((tr) => tr.dataset.factionRow)
      .filter(Boolean);
  }
  function visibleResultIdxForShortcut() {
    return $$("#result-review .result-item input[type=checkbox]")
      .map((cb) => parseInt(cb.dataset.ridx, 10))
      .filter((n) => Number.isFinite(n));
  }

  /* ---- 「只对显示出来的卡片生效」：批量前把选择收敛到可见的那些 ---- */
  // 侧栏里真正渲染出来的卡片（搜索 / 分组折叠之后剩下的）
  function shownCharIds() {
    return $$("#char-list .char-card").map((el) => el.dataset.charId).filter(Boolean);
  }
  function shownEntryIds() {
    return $$("#entry-list .entry-card").map((el) => el.dataset.entryId).filter(Boolean);
  }
  // 事件轴 / 二维事件图里当前显示的事件（线路、章节、人物、叙事、关键词筛选之后）
  function shownEventIds() {
    return visibleEvents().map((e) => e.id);
  }
  // 把某个栏目的选择集合里「当前没显示出来」的项去掉，返回被去掉的个数
  function pruneSelectionToVisible(pane) {
    const sel = pane === "char" ? batchSelected : pane === "entry" ? entryBatchSel : mergeSelected;
    const vis = new Set(pane === "char" ? shownCharIds() : pane === "entry" ? shownEntryIds() : shownEventIds());
    let dropped = 0;
    Array.from(sel).forEach((id) => {
      if (!vis.has(id)) {
        sel.delete(id);
        dropped++;
      }
    });
    return dropped;
  }
  function checkedResultIdx() {
    return $$("#result-review .result-item input[type=checkbox]:checked")
      .map((cb) => parseInt(cb.dataset.ridx, 10))
      .filter((n) => Number.isFinite(n));
  }

  // 各栏的选中集合
  function paneSelection(pane) {
    if (pane === "char") return batchSelected;
    if (pane === "entry") return entryBatchSel;
    if (pane === "event" || pane === "matrix") return mergeSelected;
    if (pane === "result") return new Set(checkedResultIdx());
    if (pane === "faction") return new Set(factionSel);
    return new Set();
  }

  function applyPaneSelection(pane, next) {
    const set = new Set(next);
    if (pane === "char") {
      batchSelected = set;
      lastPaneTag = "char";
      renderCharacters();
      renderBatchBar();
      return;
    }
    if (pane === "radar") {
      radarSelected = set;
      lastPaneTag = "radar";
      renderRadarAnalysis();
      return;
    }
    if (pane === "faction") {
      factionSel = set;
      lastPaneTag = "faction";
      renderFactionAnalysis();
      if (factionVennOpen()) drawFactionVenn(); // 韦恩图开着就跟着重画
      return;
    }
    if (pane === "entry") {
      entryBatchSel = set;
      lastPaneTag = "entry";
      renderEntries();
      renderEntryBatchBar();
      return;
    }
    if (pane === "event" || pane === "matrix") {
      mergeSelected = set;
      lastPaneTag = pane;
      if (currentViewName() === "matrix") {
        syncMatrixSelection();
        showToast(set.size ? `已选 ${set.size} 个事件 · Delete 删除 / Enter 编辑 / Ctrl+A 全选` : "已取消选择");
      } else {
        syncTimelineSelection();
      }
      return;
    }
    if (pane === "result") {
      const t = resultViewTask();
      if (!t) return;
      lastPaneTag = "result";
      (t.results || []).forEach((r, i) => {
        r.included = set.has(i);
      });
      saveState();
      renderResultReview(t);
    }
  }

  // Shift 连选：base（本次连选开始前的选择）+ 锚点到目标的整段
  function resetShortcutBase(pane, anchorId) {
    const st = SHORTCUT_SEL[pane] || (SHORTCUT_SEL[pane] = { anchor: null, base: null });
    st.anchor = anchorId === undefined ? st.anchor : anchorId;
    st.base = new Set();
    st.lastTarget = null;
    st.lastRange = null;
  }

  // Shift 连选（Windows 习惯）：
  //   ・从锚点连到目标 → 整段选中（替换原选择）；换一个目标再 Shift 点 → 调整这一段；
  //   ・同一个端点上再 Shift 点一次 → 取消这一整段（连选可反复开合）；
  //   ・Ctrl+Shift 点 → 把这一整段追加到已有选择上。
  // 锚点 = 最近一次非 Shift 点击（或上一次 Shift 连选的起点）那一项。
  function shiftClickCard(pane, targetId, orderedIds, selSet, append) {
    const st = SHORTCUT_SEL[pane] || (SHORTCUT_SEL[pane] = { anchor: null, base: null });
    if (st.anchor === null || orderedIds.indexOf(st.anchor) < 0) st.anchor = targetId;
    const range = rangeIdsBetween(orderedIds, st.anchor, targetId);
    const sameRange =
      !append &&
      st.lastTarget === targetId &&
      st.lastRange &&
      st.lastRange.length === range.length &&
      st.lastRange.every((v, i) => v === range[i]);
    if (sameRange) {
      // 再 Shift 点同一个端点 = 取消这一段
      const off = new Set(selSet);
      range.forEach((id) => off.delete(id));
      st.lastTarget = null;
      st.lastRange = null;
      st.base = null;
      applyPaneSelection(pane, off);
      showToast(`已取消这一段（${range.length} 项）的选择`);
      return;
    }
    const next = append ? new Set(selSet) : new Set();
    range.forEach((id) => next.add(id));
    st.lastTarget = targetId;
    st.lastRange = range.slice();
    st.base = null;
    applyPaneSelection(pane, next);
    if (range.length > 1) showToast(`已 Shift 连选 ${range.length} 项（同一端点再 Shift 点一次＝取消这一段）`);
  }

  // Ctrl/Cmd + 单击：单独加选 / 减选
  function toggleClickCard(pane, targetId, selSet) {
    const st = SHORTCUT_SEL[pane] || (SHORTCUT_SEL[pane] = { anchor: null, base: null });
    const next = new Set(selSet);
    if (next.has(targetId)) next.delete(targetId);
    else next.add(targetId);
    st.anchor = targetId;
    st.base = null;
    st.lastTarget = null;
    st.lastRange = null;
    applyPaneSelection(pane, next);
  }

  // 普通单击：记住锚点（下次 Shift 连选从这里开始）
  function markShortcutAnchor(pane, targetId) {
    const st = SHORTCUT_SEL[pane] || (SHORTCUT_SEL[pane] = { anchor: null, base: null });
    st.anchor = targetId;
    st.base = null;
    st.lastTarget = null;
    st.lastRange = null;
    lastPaneTag = pane;
  }

  function ensureEventSelectMode() {
    if (!mergeSelectMode) {
      mergeSelectMode = true;
      selectPurpose = "select";
    }
  }
  function ensureCharBatchMode() {
    if (!batchMode) {
      batchMode = true;
      batchSelected.clear();
      renderCharacters();
      renderBatchBar();
    }
  }
  function ensureEntryBatchMode() {
    if (!entryBatchMode) {
      entryBatchMode = true;
      renderEntries();
      renderEntryBatchBar();
    }
  }

  // 退出除 kind 之外的所有多选状态（kind ∈ "char" / "event" / "entry"；"" = 全退出）。
  // 这样「同一界面内多选」互不干扰；点到别处（空白 / 另一个界面）就自动收敛。
  function exitBatchExcept(kind) {
    if (kind !== "char" && batchMode) toggleBatchMode();
    if (kind !== "event" && mergeSelectMode) exitSelectMode();
    if (kind !== "entry" && entryBatchMode) toggleEntryBatch();
  }

  /* ---------- 多选收敛的第二半：凡是"换了界面"都要退出（用户 2026-10-17 报） ----------
     每个批量 / 多选都有自己的**地盘**：点在谁的地盘上就留谁、点在地盘外就退掉它。
     以前的 handleBatchClickOutside 只认「人物栏 / 事件轴 / 设定条目」这三个地方，
     点到二维事件图、时间线、人物分析、系谱、地图、拓扑栏、顶栏……一律不管；
     换页签 / 换选项卡（switchTab）更是完全没退出 —— 于是会出现
     「人物栏还亮着『已选 12 个』，人已经在系谱里了」这种鬼状态。 */
  const SELECT_SCOPES = [
    {
      sel: "#char-pane",
      on: () => batchMode,
      off: () => {
        batchMode = false;
        batchSelected.clear();
        renderCharacters();
        renderBatchBar();
      },
    },
    {
      sel: ".entry-pane",
      on: () => entryBatchMode,
      off: () => {
        entryBatchMode = false;
        entryBatchSel = new Set();
        renderEntries();
        renderEntryBatchBar();
      },
    },
    {
      sel: ".timeline-body, #matrix, .matrix-wrap, #chrono-list, .chrono-body, #merge-select-bar",
      on: () => mergeSelectMode,
      off: () => {
        mergeSelectMode = false;
        mergeSelected = new Set();
        /* 二维事件图里选中态是画在行头上的，得就地刷一遍（整块重画不值得） */
        if (currentViewName() === "matrix") syncMatrixSelection();
        else {
          renderTimeline();
          renderMergeSelectBar();
        }
      },
    },
    {
      sel: "#tree-pane",
      on: () => treePaneState.batch || treePaneState.batchPick || treePaneState.linkPick || treePaneState.sel.size > 0,
      off: () => {
        treePaneState.batch = false;
        treePaneState.batchPick = false;
        treePaneState.linkPick = false;
        treePaneState.sel.clear();
        renderTreeRows();
      },
    },
    {
      sel: "#view-pedigree",
      on: () => pedSel.size > 0,
      off: () => {
        pedSel = new Set();
        renderPedigree();
      },
    },
    {
      sel: "#view-radar",
      on: () => radarBatchMode || radarSelected.size > 0,
      off: () => {
        radarBatchMode = false;
        radarSelected = new Set();
        renderRadarAnalysis();
      },
    },
    {
      sel: "#view-faction",
      on: () => factionBatchMode || factionSel.size > 0,
      off: () => {
        factionBatchMode = false;
        factionSel = new Set();
        renderFactionAnalysis();
      },
    },
  ];

  /* quiet＝不弹「已退出多选」（换页签时用，免得糊用户一脸提示）。
     keep(t) 传一个判定函数：这次点击落在它自家地盘上的那份就留着（比如点的是拓扑栏里的节点，
     拓扑栏的批量就别退）。返回有没有真的退掉东西。 */
  function exitAllSelectModes(quiet, keep) {
    let did = false;
    SELECT_SCOPES.forEach((s) => {
      if (!s.on()) return;
      if (keep && keep(s.sel)) return;
      s.off();
      did = true;
    });
    // 快捷键的锚点 / 基准一并清掉，免得 Ctrl+A、方向键还停在上一个界面
    ["event", "matrix", "char", "entry", "result", "radar", "faction"].forEach((p) => resetShortcutBase(p, null));
    if (did && !quiet) showToast("已退出多选");
    return did;
  }

  // 全局点击：只在「人物 / 事件 / 设定」三个面板范围内处理多选收敛，
  // 点在卡片上就保留该卡片所属界面的多选（按住 Ctrl / Shift 时由卡片自身逻辑切过去），
  // 点在空白处则把三个界面的多选全部退出。
  function handleBatchClickOutside(ev) {
    const t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest(".modal-overlay, .context-menu, .sel-lines")) return;
    if (t.closest("input, textarea, select")) return;
    /* 三个"卡片界面"：点卡片＝留这一栏、退其它；点空白＝三栏全退（老规矩）。
       二维事件图 / 时间线里的行头也算"事件"那一栏。 */
    const inCards =
      t.closest("#char-list, #char-search") ||
      t.closest("#timeline, .timeline-wrap, #matrix, .matrix-wrap, #chrono-list, .chrono-body") ||
      t.closest("#entry-list, #entry-search");
    if (!inCards) {
      /* 点在这三个之外（别的界面 / 顶栏 / 章节边栏 / 拓扑栏 / 地图…）：
         卡片的三个多选都退掉；但**别的界面自己的批量**（拓扑栏、系谱、雷达、势力）
         要看这次点的是不是它家：是就留着，不是就也退掉。 */
      exitAllSelectModes(true, (sel) => !!(t.closest && t.closest(sel)));
      return;
    }
    const kind = t.closest(".char-card")
      ? "char"
      : t.closest(".event-card")
        ? "event"
        : t.closest("#matrix .m-row-hdr[data-event-id], .chrono-body .chrono-row")
          ? "event"
        : t.closest(".entry-card")
          ? "entry"
          : "";
    exitBatchExcept(kind);
    /* 卡片这三栏收敛完，别的界面自己的批量也一起退掉（它们的"地盘"不在这儿） */
    exitAllSelectModes(true, (sel) => !!(t.closest && t.closest(sel)));
  }

  // 分析结果：把勾选状态按集合写回（只改「是否勾选」，不动「已填入」）
  function applyResultCheckedSet(next) {
    applyPaneSelection("result", next);
  }

  function deleteCheckedResults() {
    const t = resultViewTask();
    if (!t) return Promise.resolve();
    // 只删当前显示出来、且勾选的那些
    const vis = new Set(visibleResultIdxForShortcut());
    const idxs = checkedResultIdx().filter((i) => vis.has(i));
    if (!idxs.length) {
      uiAlert("当前显示的结果里没有勾选的。批量只作用于显示出来的卡片。");
      return Promise.resolve();
    }
    return uiConfirm(`删除勾选的 ${idxs.length} 条分析结果？（已填进人物 / 事件 / 设定的内容不受影响，可撤销）`).then((ok) => {
      if (ok) deleteAnalysisResults(t, idxs);
    });
  }

  // Delete：优先作用于「最近操作、且当前可见」的那一栏里已选中的东西
  async function shortcutDelete() {
    const order = [lastPaneTag].concat(["event", "matrix", "char", "entry", "result", "faction"].filter((p) => p !== lastPaneTag));
    for (const p of order) {
      if (!paneUsable(p)) continue;
      const sel = paneSelection(p);
      if (!sel.size) continue;
      if (p === "event" || p === "matrix") {
        await deleteSelectedEvents();
        return;
      }
      if (p === "char") {
        await batchDeleteCharacters();
        return;
      }
      if (p === "entry") {
        await entryBatchDelete();
        return;
      }
      if (p === "result") {
        await deleteCheckedResults();
        return;
      }
      if (p === "faction") {
        deleteSelectedFactions();
        return;
      }
    }
    showToast("先用 Shift / Ctrl 点几张卡片选中，再按 Delete 删除");
  }

  // Ctrl+A：全选当前栏目里可见的项
  function shortcutSelectAll() {
    const pane = activeShortcutPane();
    if (pane === "char") {
      ensureCharBatchMode();
      const ids = visibleCharIdsForShortcut();
      const allOn = ids.length > 0 && ids.every((id) => batchSelected.has(id));
      ids.forEach((id) => (allOn ? batchSelected.delete(id) : batchSelected.add(id)));
      resetShortcutBase("char", ids[0] || null);
      renderCharacters();
      renderBatchBar();
      showToast(allOn ? "已取消全选（清空可见人物）" : `已全选可见的 ${batchSelected.size} 个人物`);
      return;
    }
    if (pane === "entry") {
      ensureEntryBatchMode();
      const ids = visibleEntryIdsForShortcut();
      const allOn = ids.length > 0 && ids.every((id) => entryBatchSel.has(id));
      ids.forEach((id) => (allOn ? entryBatchSel.delete(id) : entryBatchSel.add(id)));
      resetShortcutBase("entry", ids[0] || null);
      renderEntries();
      renderEntryBatchBar();
      showToast(allOn ? "已取消全选（清空可见条目）" : `已全选可见的 ${entryBatchSel.size} 个条目`);
      return;
    }
    if (pane === "event" || pane === "matrix") {
      ensureEventSelectMode();
      const ids = visibleEventIdsForShortcut();
      const allOn = ids.length > 0 && ids.every((id) => mergeSelected.has(id));
      ids.forEach((id) => (allOn ? mergeSelected.delete(id) : mergeSelected.add(id)));
      resetShortcutBase(pane, ids[0] || null);
      applyPaneSelection(pane, mergeSelected);
      showToast(allOn ? "已取消全选（清空可见事件）" : `已全选可见的 ${mergeSelected.size} 个事件`);
      return;
    }
    if (pane === "result") {
      const next = new Set(checkedResultIdx());
      const vis = visibleResultIdxForShortcut();
      const allOn = vis.length > 0 && vis.every((i) => next.has(i));
      vis.forEach((i) => (allOn ? next.delete(i) : next.add(i)));
      resetShortcutBase("result", vis[0] === undefined ? null : vis[0]);
      applyResultCheckedSet(next);
      showToast(allOn ? "已取消全选（取消勾选当前显示的这些结果）" : `已勾选当前显示的 ${vis.length} 条结果`);
      return;
    }
    /* 文本分析里的「章节 / 小节」列表：和它那颗「全选」按钮完全一样
       （按钮的文案会自己变：还没分析完的是「全选未分析章/节」，都分析完了是「全选 / 取消」） */
    if (pane === "seg") {
      const btn = $("#seg-pick-all-btn");
      if (btn && !btn.disabled) btn.click();
      return;
    }
    // 雷达分析：全选的应该是「要生成雷达的那些人物」，不是事件
    if (pane === "radar") {
      const ids = radarVisibleIds();
      const allOn = ids.length > 0 && ids.every((id) => radarSelected.has(id));
      radarBatchMode = true;
      resetShortcutBase("radar", ids[0] || null);
      applyPaneSelection("radar", allOn ? new Set() : new Set(ids));
      showToast(allOn ? "已取消全选（清空雷达分析里的人物）" : `已全选雷达分析里可见的 ${ids.length} 个人物`);
    }
    // 势力分析：全选的就是表里这些势力行（用来画韦恩图）
    if (pane === "faction") {
      const ids = factionVisibleIds();
      const allOn = ids.length > 0 && ids.every((id) => factionSel.has(id));
      factionBatchMode = true;
      resetShortcutBase("faction", ids[0] || null);
      applyPaneSelection("faction", allOn ? new Set() : new Set(ids));
      showToast(allOn ? "已取消全选（清空势力分析里的势力）" : `已全选势力分析里可见的 ${ids.length} 个势力`);
    }
  }

  // Esc：退出多选（人物 / 条目 / 事件都退）
  function shortcutExitSelectModes() {
    /* Esc＝退出所有多选。统一走 exitAllSelectModes（SELECT_SCOPES）。
       ⚠️ **拓扑栏那份要留给它自己**：拓扑栏的 Esc 有优先级（先退「关联到…」监听、再退批量），
       而且它在监听状态下按 Esc 时**故意保留批量**（退监听后还能接着点「关联到…」）。
       全局这层要是也去清它，就会把「退掉监听之后批量也没了」这种节奏搞乱
       （踩过：t_skill_tree_batch_link 里退监听再点「关联到…」就找不到按钮了）。
       系谱 / 雷达 / 势力这几处以前 Esc 是漏的，这次一起补上。 */
    return exitAllSelectModes(false, (sel) => sel === "#tree-pane");
  }

  function copySelectedCardsToClipboard() {
    const pane = activeShortcutPane();
    const kind = pane === "matrix" ? "event" : pane;
    const ids =
      kind === "char"
        ? Array.from(batchSelected)
        : kind === "entry"
          ? Array.from(entryBatchSel)
          : kind === "event"
            ? Array.from(mergeSelected)
            : [];
    const alive = ids.filter((id) => (kind === "char" ? getChar(id) : kind === "entry" ? getEntry(id) : getEvent(id)));
    if (!alive.length) {
      showToast("先选中要复制的卡片");
      return false;
    }
    cardClipboard = { type: kind, ids: alive };
    showToast(`已复制 ${alive.length} 张卡片，按 Ctrl+V 粘贴`);
    return true;
  }

  function pasteCardClipboard() {
    if (!cardClipboard || !cardClipboard.ids.length) {
      showToast("剪贴板里还没有复制的卡片");
      return false;
    }
    const pane = activeShortcutPane();
    const kind = pane === "matrix" ? "event" : pane;
    if (kind !== cardClipboard.type) {
      showToast(kind === "event" ? "剪贴板里是事件卡片，当前不在事件轴" : "当前栏目和剪贴板里的卡片类型不一致");
      return false;
    }
    const ids = cardClipboard.ids.filter((id) =>
      kind === "char" ? getChar(id) : kind === "entry" ? getEntry(id) : getEvent(id)
    );
    if (!ids.length) {
      showToast("原来复制的内容已经不在了");
      return false;
    }
    const n = kind === "char" ? copyCharacters(ids) : kind === "entry" ? copyEntries(ids) : copyEvents(ids);
    if (n) showToast(`已粘贴 ${n} 张卡片`);
    return !!n;
  }

  // Esc 退出搜索过滤：即使焦点不在搜索框里，也清掉当前所有文本搜索。
  function clearActiveSearchFilters() {
    let did = false;
    const clearInput = (sel) => {
      const el = $(sel);
      if (!el || !el.value) return false;
      el.value = "";
      return true;
    };
    if (clearInput("#char-search")) {
      renderCharacters();
      did = true;
    }
    if (clearInput("#entry-search")) {
      renderEntries();
      did = true;
    }
    if (clearInput("#ef-keyword") || eventFilter.keyword) {
      eventFilter.keyword = "";
      renderTimeline();
      renderMergeSelectBar();
      did = true;
    }
    if (clearInput("#result-search") || resultSearch) {
      resultSearch = "";
      const t = resultViewTask();
      if (t) renderResultReview(t);
      did = true;
    }
    // 只看当前显示的界面：别的页签下残留的关键词不该把 Esc 吃掉
    if (viewVisible("view-radar") && (clearInput("#radar-search") || radarQuery)) {
      radarQuery = "";
      renderRadarAnalysis();
      did = true;
    }
    if (viewVisible("view-stats") && (clearInput("#stats-search") || statsQuery)) {
      statsQuery = "";
      renderStats();
      did = true;
    }
    if (did) showToast("已退出搜索过滤");
    return did;
  }

  // Enter：打开选中项（或锚点）的编辑弹窗
  function shortcutOpenEditor() {
    const pane = activeShortcutPane();
    const pick = (set, anchor) => (set.size ? Array.from(set)[0] : anchor);
    if (pane === "char") {
      const id = pick(batchSelected, SHORTCUT_SEL.char.anchor);
      if (id && getChar(id)) openCharacterModal(id);
      return;
    }
    if (pane === "entry") {
      const id = pick(entryBatchSel, SHORTCUT_SEL.entry.anchor);
      if (id && getEntry(id)) openEntryModal(id);
      return;
    }
    if (pane === "event" || pane === "matrix") {
      const st = SHORTCUT_SEL[pane];
      const id = pick(mergeSelected, st ? st.anchor : null);
      if (id && getEvent(id)) openEventModal(id);
      return;
    }
    if (pane === "novel") {
      const row =
        document.activeElement && document.activeElement.closest
          ? document.activeElement.closest("#novel-outline .novel-row")
          : null;
      const id = row ? row.dataset.eventId : typeof novelCurrentEventId === "function" ? novelCurrentEventId() : "";
      if (id && getEvent(id)) openNovelEditor(id);
    }
  }

  /* ---- 方向键在卡片之间移动焦点（不在输入状态、没有弹窗时）----
     ↑↓ 上下一个卡片、←→ 同一行左右相邻的卡片；事件轴是二维排布，正好一组键走通。
     按位置找最近的卡片，所以「列表」「网格」「事件轴」都不用各写一套。 */
  function paneCardSelector(pane) {
    if (pane === "char") return "#char-list .char-card";
    if (pane === "novel") return "#novel-outline .novel-row";
    if (pane === "event") return "#timeline .event-card[data-event-id]";
    if (pane === "entry") return "#entry-list .entry-card";
    if (pane === "result") return "#result-review .result-item"; // 分析结果卡片的真实类名
    if (pane === "seg") return "#segment-list .segment-item[data-seg-id]";
    if (pane === "radar") return "#radar-table-wrap tr.stats-row[data-char-id]";
    if (pane === "faction") return "#faction-analysis tr[data-faction-row]";
    return "";
  }

  function focusRovingCard(el) {
    if (!el) return;
    try {
      el.setAttribute("tabindex", "-1");
    } catch (e) {
      /* ignore */
    }
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      try {
        el.focus();
      } catch (err) {
        /* ignore */
      }
    }
    try {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (e) {
      /* ignore */
    }
  }

  function moveCardFocus(key) {
    const sel = paneCardSelector(activeShortcutPane());
    if (!sel) return false;
    const cards = $$(sel).filter((el) => el.offsetParent !== null);
    if (!cards.length) return false;
    const active = document.activeElement;
    const cur = active && active.closest ? active.closest(sel) : null;
    if (!cur || cards.indexOf(cur) < 0) {
      // 还没点过卡片：往下 / 往右从第一个开始，往上 / 往左从最后一个开始
      focusRovingCard(key === "ArrowUp" || key === "ArrowLeft" ? cards[cards.length - 1] : cards[0]);
      return true;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    cards.forEach((el) => {
      if (el === cur) return;
      const b = el.getBoundingClientRect();
      if (!b.width && !b.height) return;
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      let main = 0;
      let cross = 0;
      if (key === "ArrowDown") {
        main = dy;
        cross = Math.abs(dx);
      } else if (key === "ArrowUp") {
        main = -dy;
        cross = Math.abs(dx);
      } else if (key === "ArrowRight") {
        main = dx;
        cross = Math.abs(dy);
      } else {
        main = -dx;
        cross = Math.abs(dy);
      }
      if (main < 6) return; // 必须是那个方向上、且没有重叠的卡片
      const score = main + cross * 1.6; // 同一列 / 同一行的优先
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    });
    if (!best) return false;
    focusRovingCard(best);
    return true;
  }

  // Ctrl+F：跳到当前栏目的搜索框
  function shortcutFocusSearch() {
    // 出场统计 / 雷达分析：优先聚焦它们自己的搜索框
    const sub = viewVisible("view-radar") ? "#radar-search" : viewVisible("view-stats") ? "#stats-search" : "";
    if (sub) {
      const el = $(sub);
      if (el && el.offsetParent !== null) {
        el.focus();
        if (typeof el.select === "function") el.select();
        return;
      }
    }
    const pane = activeShortcutPane();
    const sel =
      pane === "entry"
        ? "#entry-search"
        : pane === "result"
        ? "#result-search"
        : pane === "event" || pane === "matrix"
        ? "#ef-keyword"
        : "#char-search";
    let el = $(sel);
    if (el && el.offsetParent === null) el = null;
    if (!el) el = $("#char-search");
    if (!el) return;
    el.focus();
    if (typeof el.select === "function") el.select();
  }

  function onShortcutKeydown(ev) {
    if (ev.isComposing) return; // 输入法组字中
    const mod = ev.ctrlKey || ev.metaKey;
    const key = String(ev.key || "");
    const lower = key.toLowerCase();
    // Ctrl+F 任何时候都用来聚焦搜索框（含弹窗打开时）
    if (mod && lower === "f") {
      ev.preventDefault();
      if (!anyModalOpen()) shortcutFocusSearch();
      return;
    }
    // Ctrl+S：弹窗打开时由弹窗自己保存表单；没有弹窗时保存整个工作区
    if (mod && lower === "s") {
      if (anyModalOpen()) return;
      ev.preventDefault();
      saveWorkspaceNow();
      return;
    }
    if (isTypingTarget(ev.target)) return; // 正在输入，交给输入框
    if (anyModalOpen()) return; // 弹窗里不响应卡片快捷键
    // 方向键：在卡片之间移动焦点（↑↓ 上下一个，←→ 同一行左右相邻）
    if (!mod && (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight")) {
      if (moveCardFocus(key)) ev.preventDefault(); // 挪不动时不拦截，页面照常滚动
      return;
    }
    if (mod && lower === "c") {
      const sel = window.getSelection ? String(window.getSelection()) : "";
      if (sel) return; // 有选中的文字时，保留系统复制
      ev.preventDefault();
      copySelectedCardsToClipboard();
      return;
    }
    if (mod && lower === "v") {
      ev.preventDefault();
      pasteCardClipboard();
      return;
    }
    if (key === "Delete") { // 只让 Delete 删除卡片；Backspace 更常用于删字 / 返回，不触发删除
      ev.preventDefault();
      shortcutDelete();
      return;
    }
    if (mod && lower === "a") {
      ev.preventDefault();
      shortcutSelectAll();
      return;
    }
    if (key === "Enter") {
      // 方向键选中的卡片：Enter 直接打开它
      const focusCard =
        document.activeElement && document.activeElement.closest
          ? document.activeElement.closest(".char-card, .event-card, .entry-card, .result-card")
          : null;
      if (focusCard) {
        ev.preventDefault();
        // 这一下回车只用来「打开编辑器」：别让弹窗那边也接到（否则刚打开就被保存关掉）
        ev.stopImmediatePropagation();
        // 直接打开编辑器（不用等单击 / 双击的判定）
        if (focusCard.classList.contains("char-card") && focusCard.dataset.charId) openCharacterModal(focusCard.dataset.charId);
        else if (focusCard.classList.contains("entry-card") && focusCard.dataset.entryId) openEntryModal(focusCard.dataset.entryId);
        else if (focusCard.classList.contains("event-card") && focusCard.dataset.eventId) openEventModal(focusCard.dataset.eventId);
        else focusCard.click();
        return;
      }
      // 雷达分析：选中了人物就 Enter ＝ 生成雷达图（叠加）
      // （焦点在按钮上时不动它，让 Enter 照常「点」那个按钮）
      const onBtn = ev.target && String(ev.target.tagName || "").toUpperCase() === "BUTTON";
      if (viewVisible("view-radar") && radarSelected.size && !onBtn) {
        ev.preventDefault();
        showRadarOverlay();
        return;
      }
      // 势力分析：选中的势力够两个，Enter ＝ 画韦恩图
      if (viewVisible("view-faction") && factionSel.size >= 2 && !onBtn) {
        ev.preventDefault();
        showFactionVenn();
        return;
      }
      const pane = activeShortcutPane();
      if (pane !== "result") {
        ev.preventDefault();
        shortcutOpenEditor();
      }
      return;
    }
    if (ev.shiftKey && (key === "ArrowUp" || key === "ArrowDown")) {
      // Shift+↑/↓ 的「整块上移 / 下移一格」已取消：太容易误触，一按就把好几行的相对位置换掉。
      // 要挪事件请在批量条上点「↑ 上移 / ↓ 下移」，或者直接拖动卡片。
      ev.preventDefault();
      return;
    }
  }
  document.addEventListener("keydown", onShortcutKeydown);
  /* 人物分析（出场统计 / 势力分析 / 雷达分析）里的「圈圈 + 人名」：
     双击＝打开人物卡，右键＝人物卡那套菜单。
     这几张表一点击就会整表重画（节点被换掉），浏览器的 dblclick 接不到，
     所以自己按「同一个人、两次按下 < 400ms」认双击。 */
  let analysisChipTap = { id: "", at: 0 };
  document.addEventListener(
    "pointerdown",
    (ev) => {
      const id = analysisCharIdOf(ev.target);
      if (!id) return;
      const now = Date.now();
      if (analysisChipTap.id === id && now - analysisChipTap.at < 400) {
        analysisChipTap = { id: "", at: 0 };
        ev.preventDefault();
        ev.stopPropagation();
        openCharacterModal(id);
        return;
      }
      analysisChipTap = { id, at: now };
    },
    true
  );
  document.addEventListener(
    "contextmenu",
    (ev) => {
      showAnalysisCharMenu(ev);
    },
    false
  );
  // 点过哪个栏目，方向键 / 全选 / 删除这些快捷键就作用在哪个栏目
  document.addEventListener(
    "pointerdown",
    (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("#char-pane") || t.closest("#char-search")) lastPaneTag = "char";
      else if (t.closest("#entry-list") || t.closest("#cat-list") || t.closest("#entry-search")) lastPaneTag = "entry";
      else if (t.closest("#timeline") || t.closest("#chapter-rail")) lastPaneTag = "event";
      else if (t.closest("#segment-list")) lastPaneTag = "seg";
      else if (t.closest("#radar-table-wrap")) lastPaneTag = "radar";
      else if (t.closest("#result-review")) lastPaneTag = "result";
      else if (t.closest("#matrix")) lastPaneTag = "matrix";
      else if (t.closest("#chrono-list")) lastPaneTag = "event";
    },
    true
  );

  /* ---- 设置 → 全局字段 下面的「追加功能」栏（目前只有雷达图） ----
     勾上「雷达图」才出现下面的顶点模板一栏，共用同一排按钮：
     对所有目标生效 / 对新建目标生效 / 撤销 / 恢复默认。
     模板存在类别上（cat.radar.axes），装备沿用老存档搬过来的那一份。 */
  (function initGearRadarFieldset() {
    /* 这一栏是「立刻生效」的：每次写完都把当前状态记成设置界面的新基线，
       否则关掉设置弹窗时会被 discardSettingsChanges 退回（和「对所有目标生效」一个规矩）。 */
    const keepBaseline = () => {
      if (typeof settingsSnapshot !== "undefined" && settingsSnapshot) settingsSnapshot.state = deepCopyData(state);
    };
    /* 这一栏编辑的是草稿（点「保存」才写回类别）：勾选和顶点都只改草稿 */
    const draftOf = () => radarDraftOf(scopeCat());
    const axesOf = () => {
      const d = draftOf();
      return d ? d.axes : [];
    };
    const featureDraft = () => {
      const d = draftOf();
      return !!(d && d.feature);
    };
    const catEntries = (cat) => (state.settings.entries || []).filter((en) => cat && en.categoryId === cat.id);
    /* 这一栏跟着「设置 → 全局字段」右上角那个类别下拉走。
       别用 selectedCategoryId：那是「设定档案」页签里选中的类别，两边各选各的，
       混用会让这一栏该出现的时候不出现（用户看着就像「装备里没有雷达图设置」）。 */
    const scopeCat = () => {
      const sel = document.getElementById("fieldset-entry-scope");
      const v = sel && sel.value;
      const id = v && v !== "__new__" ? v : fieldsetEntryScope;
      return id ? getCat(id) : null;
    };
    /* 这一栏只对「能加雷达图」的类别出现（纪年那种按时间读的不给） */
    const scopeSupportsRadar = () => catSupportsRadar(scopeCat());
    /* 「树型拓扑」和雷达图同一栏；纪年 / 地点 / 势力不给（地点要和地图栏抢位置，以后再说） */
    const scopeSupportsTree = () => catSupportsTree(scopeCat());
    const treeFeatureDraft = () => {
      const cat = scopeCat();
      const d = cat ? treeDraftOf(cat) : null;
      return !!(d && d.feature);
    };
    const rowsHtml = () =>
      axesOf()
        .map(
          (a, i) =>
            `<div class="radar-axis-row" data-gear-row="${i}"><span class="manage-grip" draggable="true" title="${esc(
              uiTextFor("按住拖动＝调整顶点顺序")
            )}">⠿</span><span class="radar-axis-no">${i + 1}</span><input type="text" class="radar-axis-label" data-gear-name="${i}" value="${esc(
              a.label || ""
            )}" placeholder="${esc(uiTextFor("顶点名称"))}" /><input type="text" class="radar-axis-desc" data-gear-desc="${i}" value="${esc(
              a.desc || ""
            )}" placeholder="${esc(uiTextFor("说明（可选）"))}" title="${esc(
              uiTextFor("维度的含义 / 打分参考；会显示在雷达相关界面的悬停提示里")
            )}" /><button type="button" class="icon-btn radar-axis-del" data-gear-del="${i}" title="删除这个顶点（最少 1 个）">×</button></div>`
        )
        .join("");
    let sub = null;
    let addon = null;
    /* 「追加功能」那一栏：放在字段清单下面、雷达图模板上面 */
    function ensureAddon() {
      if (addon && addon.isConnected) return addon;
      const list = document.getElementById("fieldset-entry");
      if (!list || !list.parentElement) return null;
      addon = list.parentElement.querySelector(".cat-addon-sub");
      if (!addon) {
        addon = document.createElement("div");
        addon.className = "cat-addon-sub";
        addon.innerHTML =
          `<label class="cat-addon-item"><span class="cat-addon-label"></span><input type="checkbox" data-addon-radar="1" /><span class="cat-addon-name" data-addon-name="radar"></span></label>` +
          `<label class="cat-addon-item" data-addon-item="tree"><input type="checkbox" data-addon-tree="1" /><span class="cat-addon-name" data-addon-name="tree"></span></label>`;
        list.parentElement.insertBefore(addon, list.nextSibling);
        const cb = addon.querySelector("[data-addon-radar]");
        if (cb)
          cb.addEventListener("change", () => {
            const cat = scopeCat();
            const d = radarDraftOf(cat);
            if (!cat || !d) return;
            /* 只改草稿：点「保存」才写回类别（不保存就关掉设置 = 不作数） */
            d.feature = !!cb.checked;
            if (d.feature && !d.axes.length) d.axes = defaultRadarAxesFor(cat);
            paint(true);
            if (typeof renderFillProtect === "function") renderFillProtect();
          });
        const treeCb = addon.querySelector("[data-addon-tree]");
        if (treeCb)
          treeCb.addEventListener("change", () => {
            const cat = scopeCat();
            const d = treeDraftOf(cat);
            if (!cat || !d) return;
            d.feature = !!treeCb.checked; // 同样是草稿：点「保存」才作数
            paint(true);
            if (typeof renderTreePanel === "function") renderTreePanel();
          });
      }
      return addon;
    }
    function ensureSub() {
      if (sub && sub.isConnected) return sub;
      const list = document.getElementById("fieldset-entry");
      if (!list || !list.parentElement) return null;
      sub = list.parentElement.querySelector(".gear-radar-sub");
      if (!sub) {
        sub = document.createElement("div");
        sub.className = "gear-radar-sub";
        sub.innerHTML = `<div class="gear-radar-sub-head"><span class="fieldset-title"></span><span class="fieldset-head-right"><button type="button" class="btn btn-sm" data-gear-add="1"></button></span></div><div class="gear-radar-rows"></div>`;
        list.parentElement.insertBefore(sub, (ensureAddon() || list).nextSibling);
        // 按住把手拖动＝调整顶点顺序（和人物雷达图那栏一样）
        sub.addEventListener("dragstart", (ev) => {
          const r = ev.target.closest ? ev.target.closest("[data-gear-row]") : null;
          if (!r) return;
          sub.__dragFrom = parseInt(r.dataset.gearRow, 10);
          if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        });
        sub.addEventListener("dragover", (ev) => {
          if (sub.__dragFrom == null) return;
          ev.preventDefault();
        });
        sub.addEventListener("drop", (ev) => {
          const r = ev.target.closest ? ev.target.closest("[data-gear-row]") : null;
          if (!r || sub.__dragFrom == null) return;
          ev.preventDefault();
          const to = parseInt(r.dataset.gearRow, 10);
          const axes = axesOf();
          const from = sub.__dragFrom;
          sub.__dragFrom = null;
          if (to === from || from < 0 || from >= axes.length || to < 0 || to >= axes.length) return;
          axes.splice(to, 0, axes.splice(from, 1)[0]);
          paint(true);
        });
        sub.addEventListener("dragend", () => {
          sub.__dragFrom = null;
        });
        sub.addEventListener("input", (ev) => {
          const ds = (ev.target && ev.target.dataset) || {};
          const k = ds.gearName != null ? "label" : ds.gearDesc != null ? "desc" : null;
          if (!k) return;
          const a = axesOf()[parseInt(ds.gearName != null ? ds.gearName : ds.gearDesc, 10)];
          if (a) a[k] = ev.target.value;
        });
        sub.addEventListener("click", (ev) => {
          const add = ev.target.closest ? ev.target.closest("[data-gear-add]") : null;
          const del = ev.target.closest ? ev.target.closest("[data-gear-del]") : null;
          if (add) {
            if (!featureDraft() || axesOf().length >= 7) return;
            axesOf().push({ key: uid(), label: "", desc: "" });
            paint();
          } else if (del) {
            axesOf().splice(parseInt(del.dataset.gearDel, 10), 1);
            if (!axesOf().length) axesOf().push({ key: uid(), label: "", desc: "" });
            paint();
          }
        });
      }
      return sub;
    }
    /* force＝连输入框一起重画（刚加/删顶点时用）；平时已经显示就别重画，
       免得打断正在输入的人。 */
    function paint(force) {
      const addonEl = ensureAddon();
      const el = ensureSub();
      if (!el || !addonEl) return;
      const cat = scopeCat();
      /* 「追加功能」栏：两个勾选项各自按类别判断能不能给
         （雷达图：纪年不给；树型拓扑：纪年 / 地点 / 势力不给） */
      const canRadar = scopeSupportsRadar();
      const canTree = scopeSupportsTree();
      const showAddon = canRadar || canTree;
      addonEl.hidden = !showAddon;
      const feat = canRadar && featureDraft();
      el.hidden = !feat;
      const treeItem = addonEl.querySelector('[data-addon-item="tree"]');
      if (treeItem) treeItem.hidden = !canTree;
      const radarItem = addonEl.querySelector("[data-addon-radar]");
      if (radarItem) radarItem.closest(".cat-addon-item").hidden = !canRadar;
      if (showAddon) {
        addonEl.querySelector(".cat-addon-label").textContent = uiTextFor("追加功能：");
        const cb = addonEl.querySelector("[data-addon-radar]");
        /* 只在「换了类别 / 刚打开」时把数据写回勾选框：
           每次 document click 都无脑写回的话，会在 change 之前把用户刚点的勾抹掉
           （表现就是「勾选框点不动」）。 */
        const catKey = cat ? cat.id : "";
        if (cb && addonEl.dataset.catId !== catKey) {
          addonEl.dataset.catId = catKey;
          cb.checked = feat;
        } else if (cb && force) {
          cb.checked = feat;
        }
        const treeCb = addonEl.querySelector("[data-addon-tree]");
        const catKey2 = cat ? cat.id : "";
        if (treeCb && addonEl.dataset.catIdTree !== catKey2) {
          addonEl.dataset.catIdTree = catKey2;
          treeCb.checked = !!(canTree && treeFeatureDraft());
        } else if (treeCb && force) {
          treeCb.checked = !!(canTree && treeFeatureDraft());
        }
        const nm = addonEl.querySelector('[data-addon-name="radar"]');
        if (nm) nm.textContent = uiTextFor("雷达图");
        const nmTree = addonEl.querySelector('[data-addon-name="tree"]');
        if (nmTree) nmTree.textContent = uiTextFor("树型拓扑");
      }
      // 勾了「追加功能 → 雷达图」才在「输入保护」里列出「雷达图」那一行
      const sig = showAddon
        ? (cat ? cat.id : "") + "|" + (feat ? "1" : "0") + "|" + axesOf().length
        : "0";
      if (sig !== paint.__sig) {
        paint.__sig = sig;
        if (typeof renderFillProtect === "function") renderFillProtect();
      }
      if (!feat) return;
      el.querySelector(".fieldset-title").textContent = uiTextFor("雷达图");
      el.querySelector("[data-gear-add]").textContent = uiTextFor("＋ 新建顶点");
      const addBtn = el.querySelector("[data-gear-add]");
      if (addBtn) addBtn.disabled = false;
      const box = el.querySelector(".gear-radar-rows");
      if (!force && box.querySelectorAll("[data-gear-name]").length === axesOf().length) return;
      box.innerHTML = rowsHtml();
    }
    // 那排共用按钮：当前类别的雷达图开着时，额外作用到雷达模板上
    document.addEventListener(
      "click",
      (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest("[data-fieldset-apply][data-scope], [data-fieldset-reset]") : null;
        const cat = scopeCat();
        if (!btn || !featureDraft()) return;
        if (btn.dataset.fieldsetApply) {
          if (btn.dataset.scope !== "all") return; // 「对新建目标生效」＝模板本身就是新建初值
          const tpl = JSON.parse(JSON.stringify(axesOf()));
          catEntries(cat).forEach((en) => {
            en.radarAxes = JSON.parse(JSON.stringify(tpl));
          });
          showToast(uiTextFor("已应用到这个类别的所有条目"));
        } else if (btn.dataset.fieldsetReset) {
          /* 恢复默认也只是改草稿：点「保存」才作数 */
          const d = radarDraftOf(cat);
          if (d) d.axes = defaultRadarAxesFor(cat);
          paint();
          showToast(uiTextFor("已恢复默认字段；点「对所有目标生效」或「对新建目标生效」应用"));
        }
      },
      true
    );
    // 打开设置 / 换类别都会在设置面板里点一下：借这个时机重画一次
    document.addEventListener("click", () => paint(), false);
    // 类别选择框走的是 change（不是点击），也要跟着刷新——不然换到别的类别时这一栏还留着
    document.addEventListener("change", () => paint(), false);

    const boot = () => {
      const list = document.getElementById("fieldset-entry");
      if (list && list.parentElement && typeof MutationObserver === "function" && !initGearRadarFieldset.mo) {
        initGearRadarFieldset.mo = new MutationObserver(() => paint(true));
        initGearRadarFieldset.mo.observe(list, { childList: true, subtree: true });
      }
      paint(true);
    };
    window.addEventListener("load", boot);
    boot();
  })();

  /* ---- 装备条目信息卡里的雷达图 ----
     版式和人物信息卡的雷达图一致：顶点名 + 0~10 数值（带 ▲▼ 步进）+「生成雷达图」，
     数值 0~10 可小数；只在信息卡里画，列表卡片不画。
     勾上「雷达图」才展开：照当时的全局模板初始化这一张的顶点，之后可独立改名 / 增删。
     新建条目时还没有记录，先拿一份草稿兜着，保存时再写进新建的那一条。 */
  (function initGearRadarCard() {
    const clone = (a) => JSON.parse(JSON.stringify(Array.isArray(a) ? a : []));
    const templateAxesFor = (cat) => clone(catRadarAxes(cat));
    /* 「追加功能 → 雷达图」勾了的类别，信息卡里才有这一栏（装备默认勾着） */
    const isGearCat = (cat) => catRadarFeatureOn(cat);
    const isGearEntry = (en) => !!(en && isGearCat(getCat(en.categoryId)));
    const sourceEl = () => document.getElementById("entry-form") || document.querySelector("#entry-modal .modal-body");
    let box = null;
    const curEntry = () => {
      const id = ($("#entry-id") || {}).value || "";
      return id ? getEntry(id) : null;
    };
    // 新建条目时的雷达草稿（保存时写进新建的那条）
    let newDraft = null;
    let newDraftCatId = "";
    const gearEntryIds = () => {
      const ids = new Set();
      (state.settings.entries || []).forEach((en) => {
        if (isGearEntry(en)) ids.add(en.id);
      });
      return ids;
    };
    const draftFor = (catId) => {
      if (!newDraft || newDraftCatId !== catId) {
        newDraftCatId = catId;
        // 记下打开卡片时已经有哪些装备条目：保存时靠它认出「刚建好的那一条」
        newDraft = { on: false, axes: templateAxesFor(getCat(catId)), values: {}, seen: gearEntryIds() };
      }
      return newDraft;
    };
    /* 当前这张卡要编辑的东西：已有条目 → 那条记录；新建的装备 → 草稿；都不是 → null */
    function subject() {
      const modal = document.getElementById("entry-modal");
      if (!modal || modal.hidden) return null;
      const en = curEntry();
      if (en) {
        if (!isGearEntry(en)) return null;
        if (!Array.isArray(en.radarAxes) || !en.radarAxes.length) en.radarAxes = templateAxesFor(getCat(en.categoryId));
        if (!en.radar || typeof en.radar !== "object") en.radar = {};
        return { entry: en, saved: true };
      }
      const catId = ($("#entry-cat") || {}).value || "";
      const cat = catId ? getCat(catId) : null;
      if (!isGearCat(cat)) return null;
      return { draft: draftFor(cat.id), saved: false, key: "__new__:" + cat.id, catId: cat.id };
    }
    const sKey = (s) => (s.saved ? s.entry.id : s.key);
    const sAxes = (s) => (s.saved ? s.entry.radarAxes : s.draft.axes);
    const sValues = (s) => (s.saved ? s.entry.radar : s.draft.values);
    const sOn = (s) => (s.saved ? s.entry.radarOn === true : s.draft.on === true);
    // 顶点行：名字 + 0~10 数值（可手填、可点 ▲▼、可滚轮），可改名 / 删掉；
    // 末尾那个「＋」＝新建顶点（跟在最后一个顶点后面）
    const rowsHtml = (axes, values) =>
      axes
        .map(
          (a, i) =>
            `<div class="radar-in"><input type="text" class="radar-in-name" data-card-axis="${i}" value="${esc(
              a.label || ""
            )}" placeholder="${esc(uiTextFor("顶点名称"))}" title="${esc(
              a.desc ? a.label + "：" + a.desc : a.label || ""
            )}" /><span class="radar-in-box"><input type="number" class="radar-in-val" data-card-val="${i}" min="0" max="10" step="0.1" value="${
              values[a.key] == null ? "" : esc(String(values[a.key]))
            }" placeholder="0~10" /><span class="radar-in-steps"><button type="button" class="radar-step radar-step-up" tabindex="-1" title="加 0.1">▲</button><button type="button" class="radar-step radar-step-down" tabindex="-1" title="减 0.1">▼</button></span></span><button type="button" class="icon-btn radar-in-del" data-card-del="${i}" title="删除这个顶点（最少 1 个）">×</button></div>`
        )
        .join("") +
      (axes.length >= 7
        ? ""
        : `<button type="button" class="radar-in-add" data-card-add="1" title="${esc(
            uiTextFor("新建雷达图顶点")
          )}">＋</button>`);
    const chartHtml = (axes, values) => radarChartSvg(axes, values, [], null);
    function paint(force) {
      const host = sourceEl();
      const s = host ? subject() : null;
      if (!host || !s) {
        // 这一类没有「雷达图」这个追加功能：把弹窗里所有这一栏都藏起来（防止上一张卡留下的那栏还亮着）
        document.querySelectorAll("#entry-modal .gear-radar-card").forEach((el) => {
          el.hidden = true;
        });
        return;
      }
      // 这一类的雷达图被禁用：整栏都不出现（数值留着，重新启用就回来）
      if (!catRadarOn(getCat(($("#entry-cat") || {}).value || (s.entry ? s.entry.categoryId : "")))) {
        document.querySelectorAll("#entry-modal .gear-radar-card").forEach((el) => {
          el.hidden = true;
        });
        return;
      }
      if (!box || !box.isConnected) {
        box = document.createElement("div");
        box.className = "field gear-radar-card";
        box.innerHTML = `<div class="field-head-row"><label class="radar-toggle"><input type="checkbox" data-card-on="1" /><span class="field-label"></span></label></div><div class="radar-inputs" data-card-rows="1" hidden></div><div class="radar-chart gear-radar-chart" hidden></div>`;
        box.querySelector(".radar-toggle span").title = uiTextFor(
          "勾上就按下面填的数值画雷达图（0 ~ 10，可小数）"
        );
        bindGearCardBox(box);
        const foot = host.querySelector(".modal-foot");
        if (foot) host.insertBefore(box, foot);
        else host.appendChild(box);
      }
      box.hidden = false;
      const key = sKey(s);
      const changed = box.dataset.targetKey !== key;
      box.dataset.targetKey = key;
      // 文案（切语言 / 重开卡片时都要跟着走）
      box.querySelector(".radar-toggle span").textContent = uiTextFor("雷达图");
      const on = sOn(s);
      /* 只在「换了一张卡 / 刚打开」时同步勾选状态：
         点勾选框本身也会走到这里（点击会冒泡到 document），那时硬写回旧值
         会把刚勾上的又抹掉 —— 表现就是「勾了跟没勾一样」。 */
      if (force || changed) box.querySelector("[data-card-on]").checked = on;
      box.classList.toggle("radar-off", !on);
      const rows = box.querySelector("[data-card-rows]");
      const chart = box.querySelector(".gear-radar-chart");
      const axes = sAxes(s);
      const values = sValues(s);
      rows.hidden = !on;
      if (!on) {
        chart.hidden = true;
        chart.innerHTML = "";
        box.dataset.axes = "";
        return;
      }
      if (
        force ||
        changed ||
        box.dataset.axes !== String(axes.length) ||
        rows.querySelectorAll("[data-card-axis]").length !== axes.length
      ) {
        rows.innerHTML = rowsHtml(axes, values);
        box.dataset.axes = String(axes.length);
      }
      // 数值画出来（两个顶点以上才有图）：和人物雷达图同一套画法
      chart.hidden = axes.length < 2;
      chart.innerHTML = chart.hidden ? "" : `<div class="gear-radar-canvas">${chartHtml(axes, values)}</div>`;
    }
    const repaint = () => paint(true);
    /* 卡片里那几颗按钮：▲▼ 步进（可按住 / 滚轮）、新建 / 删除顶点。
       只绑一次（box 建好就绑），行是重画的，所以统一走事件委托。 */
    function bindGearCardBox(el) {
      const valOf = (btn) => {
        const boxEl = btn.closest ? btn.closest(".radar-in-box") : null;
        return boxEl ? boxEl.querySelector(".radar-in-val") : null;
      };
      const bump = (inp, dir, step) => {
        if (!inp) return;
        const cur = parseFloat(inp.value);
        const base = Number.isFinite(cur) ? cur : 0;
        const next = Math.max(0, Math.min(10, Math.round((base + dir * step) * 10) / 10));
        inp.value = String(next);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const stopHold = (btn) => {
        if (btn && btn.__holdTimer) {
          clearInterval(btn.__holdTimer);
          btn.__holdTimer = 0;
        }
      };
      el.addEventListener("pointerdown", (ev) => {
        const btn = ev.target.closest ? ev.target.closest(".radar-step") : null;
        if (!btn) return;
        ev.preventDefault();
        const inp = valOf(btn);
        const dir = btn.classList.contains("radar-step-up") ? 1 : -1;
        btn.__stepped = true;
        bump(inp, dir, 0.1);
        const started = performance.now();
        stopHold(btn);
        btn.__holdTimer = setInterval(() => {
          const t = performance.now() - started;
          bump(inp, dir, t < 600 ? 0.1 : t < 1500 ? 0.2 : 0.5);
        }, 80);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach((type) =>
        el.addEventListener(type, (ev) => {
          const btn = ev.target.closest ? ev.target.closest(".radar-step") : null;
          if (btn) stopHold(btn);
        })
      );
      el.addEventListener("click", (ev) => {
        const btn = ev.target.closest ? ev.target.closest(".radar-step") : null;
        if (!btn) return;
        ev.preventDefault();
        if (btn.__stepped) {
          btn.__stepped = false; // pointerdown 已经步进过一次了
          return;
        }
        bump(valOf(btn), btn.classList.contains("radar-step-up") ? 1 : -1, 0.1);
      });
      el.addEventListener(
        "wheel",
        (ev) => {
          const inp = ev.target.closest ? ev.target.closest(".radar-in-val") : null;
          if (!inp) return;
          ev.preventDefault();
          const boxEl = inp.closest(".radar-in-box");
          bump(boxEl ? boxEl.querySelector(".radar-in-val") : null, ev.deltaY < 0 ? 1 : -1, ev.shiftKey ? 1 : 0.1);
        },
        { passive: false }
      );
    }
    document.addEventListener(
      "input",
      (ev) => {
        const s = subject();
        if (!s || !box || !box.contains(ev.target)) return;
        const t = ev.target;
        const axes = sAxes(s);
        const values = sValues(s);
        if (t.dataset.cardAxis != null) {
          const a = axes[parseInt(t.dataset.cardAxis, 10)];
          if (a) a.label = t.value;
        } else if (t.dataset.cardVal != null) {
          const a = axes[parseInt(t.dataset.cardVal, 10)];
          if (!a) return;
          const v = parseFloat(t.value);
          if (Number.isFinite(v)) values[a.key] = Math.max(0, Math.min(10, v));
          else delete values[a.key];
        } else return;
        if (s.saved) saveState();
        const chart = box.querySelector(".gear-radar-chart");
        if (chart && !chart.hidden) chart.innerHTML = `<div class="gear-radar-canvas">${chartHtml(axes, values)}</div>`;
      },
      false
    );
    document.addEventListener(
      "change",
      (ev) => {
        const s = subject();
        if (!s || !box || !box.contains(ev.target)) return;
        if (ev.target.dataset.cardOn == null) return;
        const on = ev.target.checked === true;
        if (s.saved) {
          s.entry.radarOn = on;
          saveState();
        } else {
          s.draft.on = on;
        }
        repaint();
      },
      false
    );
    document.addEventListener(
      "click",
      (ev) => {
        const s = subject();
        if (!s || !box || !box.contains(ev.target)) return;
        const add = ev.target.closest ? ev.target.closest("[data-card-add]") : null;
        const del = ev.target.closest ? ev.target.closest("[data-card-del]") : null;
        if (add) {
          const axes = sAxes(s);
          if (axes.length >= 7) return;
          axes.push({ key: uid(), label: "", desc: "" });
        } else if (del) {
          const axes = sAxes(s);
          const values = sValues(s);
          const a = axes.splice(parseInt(del.dataset.cardDel, 10), 1)[0];
          if (a) delete values[a.key];
          if (!axes.length) axes.push({ key: uid(), label: "", desc: "" });
        } else return;
        if (s.saved) saveState();
        repaint();
      },
      false
    );
    const modal = document.getElementById("entry-modal");
    if (modal && typeof MutationObserver === "function") {
      new MutationObserver(() => {
        // 关掉卡片＝这份新建草稿作废
        if (modal.hidden) {
          newDraft = null;
          newDraftCatId = "";
        } else repaint();
      }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
    }
    // 新建条目：提交时把草稿写进刚建好的那一条
    const entryForm = document.getElementById("entry-form");
    if (entryForm) {
      entryForm.addEventListener(
        "submit",
        () => {
          const d = newDraft;
          newDraft = null;
          newDraftCatId = "";
          if (!d || !d.on) return;
          /* 记录是同一个 submit 上更早那个监听建出来的（那时还把表单清空了，
             所以拿不到 id）：等它建完，再按「新出现的装备条目」认出这一条。 */
          setTimeout(() => {
            const fresh = (state.settings.entries || []).filter((en) => isGearEntry(en) && !d.seen.has(en.id));
            const en = fresh.length ? fresh[fresh.length - 1] : null;
            if (!en) return;
            en.radarOn = true;
            en.radarAxes = clone(d.axes);
            en.radar = Object.assign({}, d.values);
            saveState();
          }, 0);
        },
        false
      );
    }
    // 同一个弹窗重复打开时 hidden 不变，所以点卡片时也顺手对一次（不重画输入框）
    document.addEventListener(
      "click",
      (ev) => {
        const m = document.getElementById("entry-modal");
        if (!m || m.hidden) return;
        // 卡片内部的点击（勾选 / 步进 / 新建顶点…）自己处理，别在这里凑热闹
        if (ev.target && ev.target.closest && ev.target.closest(".gear-radar-card")) return;
        paint(false);
      },
      false
    );
    window.addEventListener("load", () => paint(true));
  })();

