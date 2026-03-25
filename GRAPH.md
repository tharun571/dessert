# dessert — code review graph

Three diagrams: architecture layers, module dependencies, and data flow.

---

## 1. system architecture

```mermaid
graph TB
    subgraph EXT["browser extension (MV3)"]
        content["content.js<br/>scroll/focus tracker"]
        background["background.js<br/>batch sender"]
        content -->|"active_scroll_ms samples"| background
    end

    subgraph TAURI["tauri app (macOS)"]
        subgraph THREADS["background threads"]
            tracker["tracker.rs<br/>lsappinfo + CoreGraphics<br/>60s tick loop"]
            bridge["browser_bridge.rs<br/>HTTP :43137<br/>grace period logic"]
        end

        subgraph COMMANDS["tauri command handlers"]
            sessions["commands/sessions.rs<br/>14 commands"]
            tasks["commands/tasks.rs<br/>6 commands"]
            rewards["commands/rewards.rs<br/>9 commands"]
            scoring["commands/scoring.rs<br/>3 commands"]
            rules["commands/rules.rs<br/>3 commands"]
            tracker_cmd["commands/tracker.rs<br/>1 command"]
        end

        subgraph STATE["AppState (Arc+Mutex)"]
            db["db: Arc&lt;Mutex&lt;Connection&gt;&gt;<br/>dessert.sqlite"]
            tstate["tracker: Arc&lt;Mutex&lt;TrackerState&gt;&gt;"]
            bstate["bridge: Arc&lt;Mutex&lt;BridgeState&gt;&gt;"]
        end

        subgraph DB["sqlite tables"]
            sessions_t["sessions"]
            tasks_t["tasks"]
            rewards_t["rewards"]
            inventory_t["inventory_items"]
            score_t["score_events"]
            raw_t["raw_events"]
            app_rules_t["app_rules"]
            site_rules_t["site_rules"]
            effects_t["active_effects"]
            settings_t["settings"]
            nudge_t["nudge_events"]
        end
    end

    subgraph FRONTEND["react frontend (vite :1420)"]
        subgraph LIB["lib/"]
            api["api.ts<br/>34 invoke() wrappers"]
            types["types.ts<br/>TS interfaces"]
            sounds["sounds.ts<br/>Web Audio API"]
        end

        subgraph PAGES["features/"]
            home["HomePage.tsx<br/>dashboard + session"]
            tasks_p["TasksPage.tsx<br/>quests + habits"]
            rewards_p["RewardsPage.tsx<br/>desserts shop"]
            inventory_p["InventoryPage.tsx<br/>use rewards"]
            timeline_p["TimelinePage.tsx<br/>score history"]
            settings_p["SettingsPage.tsx<br/>rules viewer"]
        end

        App["App.tsx<br/>nav + router"]
    end

    background -->|"POST /events"| bridge
    tracker -->|"Arc clone"| db
    tracker -->|"Arc clone"| tstate
    bridge -->|"Arc clone"| db
    bridge -->|"Arc clone"| bstate
    sessions -->|"state.db.lock()"| db
    tasks -->|"state.db.lock()"| db
    rewards -->|"state.db.lock()"| db
    scoring -->|"state.db.lock()"| db
    rules -->|"state.db.lock()"| db
    tracker_cmd -->|"state.tracker.lock()"| tstate

    tracker --> sessions_t
    tracker --> app_rules_t
    tracker --> score_t
    tracker --> raw_t
    bridge --> site_rules_t
    bridge --> effects_t
    bridge --> score_t
    bridge --> raw_t

    sessions --> sessions_t
    sessions --> score_t
    tasks --> tasks_t
    tasks --> score_t
    rewards --> rewards_t
    rewards --> inventory_t
    rewards --> score_t
    rewards --> effects_t
    scoring --> score_t
    scoring --> sessions_t
    rules --> app_rules_t
    rules --> site_rules_t

    api -->|"invoke() IPC"| sessions
    api -->|"invoke() IPC"| tasks
    api -->|"invoke() IPC"| rewards
    api -->|"invoke() IPC"| scoring
    api -->|"invoke() IPC"| rules
    api -->|"invoke() IPC"| tracker_cmd

    App --> home
    App --> tasks_p
    App --> rewards_p
    App --> inventory_p
    App --> timeline_p
    App --> settings_p

    home --> api
    tasks_p --> api
    rewards_p --> api
    inventory_p --> api
    timeline_p --> api
    settings_p --> api

    home --> sounds
    tasks_p --> sounds
    rewards_p --> sounds
    inventory_p --> sounds
```

---

## 2. rust module dependencies

```mermaid
graph LR
    main["main.rs"] --> lib["lib.rs"]

    lib --> db["db.rs<br/>open() migrate()"]
    lib --> models["models.rs<br/>all structs"]
    lib --> seeds["seeds.rs<br/>seed_if_empty()"]
    lib --> tracker["tracker.rs<br/>TrackerState start()"]
    lib --> bridge["browser_bridge.rs<br/>BridgeState start()"]
    lib --> commands["commands/mod.rs"]

    commands --> cmd_sessions["commands/sessions.rs"]
    commands --> cmd_tasks["commands/tasks.rs"]
    commands --> cmd_rewards["commands/rewards.rs"]
    commands --> cmd_scoring["commands/scoring.rs"]
    commands --> cmd_rules["commands/rules.rs"]
    commands --> cmd_tracker["commands/tracker.rs"]

    cmd_sessions --> models
    cmd_tasks --> models
    cmd_rewards --> models
    cmd_scoring --> models
    cmd_rules --> models
    cmd_tracker --> tracker

    tracker --> db
    bridge --> db
    seeds --> db

    style lib fill:#f97316,color:#fff
    style db fill:#6366f1,color:#fff
    style models fill:#6366f1,color:#fff
    style tracker fill:#10b981,color:#fff
    style bridge fill:#10b981,color:#fff
```

---

## 3. frontend component → API dependencies

```mermaid
graph LR
    subgraph PAGES["pages"]
        home["HomePage"]
        tasks_p["TasksPage"]
        rewards_p["RewardsPage"]
        inventory_p["InventoryPage"]
        timeline_p["TimelinePage"]
        settings_p["SettingsPage"]
    end

    subgraph SESSION_API["session commands"]
        sessionStart["sessionStart"]
        sessionStop["sessionStop"]
        sessionPause["sessionPause"]
        sessionResume["sessionResume"]
        sessionGetCurrent["sessionGetCurrent"]
        dayPlanningStatus["dayPlanningStatus"]
        sessionEndStats["sessionEndStats"]
        logSunlight["logSunlight"]
        logGym["logGym"]
        logBook["logBook"]
        logWalk["logWalk"]
        logNoOutsideFood["logNoOutsideFood"]
        unlogHabit["unlogHabit"]
    end

    subgraph TASK_API["task commands"]
        taskCreate["taskCreate"]
        taskMarkDone["taskMarkDone"]
        taskReopen["taskReopen"]
        taskDelete["taskDelete"]
        taskUpdate["taskUpdate"]
        taskListForDate["taskListForDate"]
    end

    subgraph REWARD_API["reward commands"]
        rewardList["rewardList"]
        rewardCreate["rewardCreate"]
        rewardUpdate["rewardUpdate"]
        rewardDelete["rewardDelete"]
        rewardPurchase["rewardPurchase"]
        inventoryListAvailable["inventoryListAvailable"]
        inventoryListConsumed["inventoryListConsumed"]
        inventoryConsume["inventoryConsume"]
    end

    subgraph SCORE_API["scoring commands"]
        scoreGetToday["scoreGetToday"]
        scoreGetOverall["scoreGetOverall"]
        timelineGetForDay["timelineGetForDay"]
    end

    home --> sessionStart
    home --> sessionStop
    home --> sessionPause
    home --> sessionResume
    home --> sessionGetCurrent
    home --> sessionEndStats
    home --> dayPlanningStatus
    home --> logSunlight
    home --> logGym
    home --> taskMarkDone
    home --> taskCreate
    home --> taskListForDate
    home --> scoreGetToday
    home --> scoreGetOverall
    home --> trackerGetStatus["trackerGetStatus"]

    tasks_p --> taskCreate
    tasks_p --> taskMarkDone
    tasks_p --> taskReopen
    tasks_p --> taskDelete
    tasks_p --> taskUpdate
    tasks_p --> taskListForDate
    tasks_p --> dayPlanningStatus
    tasks_p --> logSunlight
    tasks_p --> logGym
    tasks_p --> logBook
    tasks_p --> logWalk
    tasks_p --> logNoOutsideFood
    tasks_p --> unlogHabit

    rewards_p --> rewardList
    rewards_p --> rewardCreate
    rewards_p --> rewardUpdate
    rewards_p --> rewardDelete
    rewards_p --> rewardPurchase
    rewards_p --> sessionGetCurrent
    rewards_p --> scoreGetOverall

    inventory_p --> inventoryListAvailable
    inventory_p --> inventoryListConsumed
    inventory_p --> inventoryConsume
    inventory_p --> sessionGetCurrent

    timeline_p --> timelineGetForDay
    timeline_p --> scoreGetToday
    timeline_p --> scoreGetOverall

    settings_p --> rulesGetAll["rulesGetAll"]
```

---

## 4. data flow: session lifecycle

```mermaid
sequenceDiagram
    participant U as user
    participant FE as react (HomePage)
    participant IPC as tauri IPC
    participant BE as commands/sessions.rs
    participant DB as sqlite
    participant TK as tracker thread

    U->>FE: click "start session"
    FE->>IPC: sessionStart(date)
    IPC->>BE: session_start()
    BE->>DB: SELECT COUNT tasks (today + carryover)
    BE->>DB: UPDATE sessions SET state='ended' WHERE state='active'
    BE->>DB: INSERT sessions (state='active', score_total=0)
    BE->>DB: INSERT score_events (session_started, +5) [if < 6 sessions today]
    BE->>DB: UPDATE sessions SET score_total=5
    BE-->>FE: Session {id, score_total:5}
    FE->>FE: start 1s timer, show score +5

    loop every 60s
        TK->>TK: lsappinfo front → ASN → info
        TK->>DB: SELECT app_rules WHERE bundle_id matches
        TK->>DB: SELECT sessions WHERE state='active'
        TK->>DB: INSERT raw_events
        TK->>DB: check elapsed_mins vs milestones
        alt elapsed >= 30min (first time)
            TK->>DB: INSERT score_events (session_combo_30, +5)
            TK->>DB: UPDATE sessions SET score_total += 5
        end
        alt negative app in focus
            TK->>DB: INSERT score_events (red_site_penalty, -3)
            TK->>DB: UPDATE sessions SET score_total -= 3
        end
    end

    FE->>IPC: sessionGetCurrent() [every 5s]
    IPC->>DB: SELECT sessions WHERE state IN (active,paused)
    DB-->>FE: Session {score_total: updated}
    FE->>FE: re-render score

    U->>FE: click "stop session"
    FE->>IPC: sessionStop(id)
    IPC->>BE: session_stop()
    BE->>DB: UPDATE sessions SET state='ended', ended_at=now
    FE->>IPC: sessionEndStats(id)
    IPC->>BE: session_end_stats()
    BE->>DB: compare duration vs longest_today/week/ever
    BE-->>FE: SessionEndStats {is_longest_today, ...}
    FE->>FE: show confetti overlay + stats
```

---

## 5. scoring events map

```mermaid
graph LR
    subgraph SOURCES["event sources"]
        S1["session_start<br/>(commands/sessions.rs)"]
        S2["task_mark_done<br/>(commands/tasks.rs)"]
        S3["reward_purchase<br/>(commands/rewards.rs)"]
        S4["tracker tick<br/>(tracker.rs)"]
        S5["browser_bridge<br/>(browser_bridge.rs)"]
        S6["habit logging<br/>(commands/sessions.rs)"]
        S7["task_reopen<br/>(commands/tasks.rs)"]
    end

    subgraph CODES["reason_codes → delta"]
        C1["session_started → +5<br/>(first 6/day only)"]
        C2["session_combo_30 → +5"]
        C3["session_combo_60 → +10"]
        C4["session_combo_90 → +15"]
        C5["session_combo_120 → +20"]
        C6["task_completed → +15"]
        C7["main_quest_completed → +25"]
        C8["reward_purchased → −cost"]
        C9["red_site_penalty → −3/min"]
        C10["ambient_red_site_penalty → −1/min"]
        C11["sunlight → +10"]
        C12["gym → +10"]
        C13["book → +10"]
        C14["walk → +10"]
        C15["no_outside_food → +10"]
        C16["task_reopened → −15 or −25"]
    end

    S1 --> C1
    S4 --> C2
    S4 --> C3
    S4 --> C4
    S4 --> C5
    S4 --> C9
    S5 --> C9
    S5 --> C10
    S2 --> C6
    S2 --> C7
    S3 --> C8
    S6 --> C11
    S6 --> C12
    S6 --> C13
    S6 --> C14
    S6 --> C15
    S7 --> C16

    style C1 fill:#16a34a,color:#fff
    style C2 fill:#16a34a,color:#fff
    style C3 fill:#16a34a,color:#fff
    style C4 fill:#16a34a,color:#fff
    style C5 fill:#16a34a,color:#fff
    style C6 fill:#16a34a,color:#fff
    style C7 fill:#16a34a,color:#fff
    style C8 fill:#dc2626,color:#fff
    style C9 fill:#dc2626,color:#fff
    style C10 fill:#dc2626,color:#fff
    style C11 fill:#ca8a04,color:#fff
    style C12 fill:#ca8a04,color:#fff
    style C13 fill:#ca8a04,color:#fff
    style C14 fill:#ca8a04,color:#fff
    style C15 fill:#ca8a04,color:#fff
    style C16 fill:#dc2626,color:#fff
```
