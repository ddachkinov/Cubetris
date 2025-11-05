using UnityEngine;
using System.Collections.Generic;
using System.IO;
using System;

namespace Cubetris
{
    /// <summary>
    /// Manages level configuration loading from JSON and applies level parameters to game systems.
    /// Handles level progression and difficulty scaling.
    /// </summary>
    public class LevelManager : MonoBehaviour
    {
        [Header("Level Configuration")]
        [SerializeField] private string levelConfigPath = "Configs/levels";
        [SerializeField] private int currentLevelIndex = 1;
        [SerializeField] private LevelData currentLevel;

        [Header("References")]
        [SerializeField] private Spawner spawner;
        [SerializeField] private WallController wallController;

        private List<LevelData> allLevels = new List<LevelData>();
        private bool levelsLoaded = false;

        private void Awake()
        {
            // Auto-find references if not set
            if (spawner == null) spawner = FindObjectOfType<Spawner>();
            if (wallController == null) wallController = FindObjectOfType<WallController>();
        }

        private void Start()
        {
            LoadLevelConfigurations();
        }

        /// <summary>
        /// Load all level configurations from JSON file in Resources.
        /// </summary>
        private void LoadLevelConfigurations()
        {
            try
            {
                // Load from Resources folder
                TextAsset jsonFile = Resources.Load<TextAsset>(levelConfigPath);

                if (jsonFile == null)
                {
                    Debug.LogError($"Level config file not found at Resources/{levelConfigPath}");
                    CreateDefaultLevels();
                    return;
                }

                // Parse JSON
                LevelDataWrapper wrapper = JsonUtility.FromJson<LevelDataWrapper>("{\"levels\":" + jsonFile.text + "}");
                allLevels = new List<LevelData>(wrapper.levels);

                levelsLoaded = true;
                Debug.Log($"Loaded {allLevels.Count} levels from configuration");
            }
            catch (Exception e)
            {
                Debug.LogError($"Failed to load level configurations: {e.Message}");
                CreateDefaultLevels();
            }
        }

        /// <summary>
        /// Create default levels if JSON loading fails.
        /// </summary>
        private void CreateDefaultLevels()
        {
            allLevels = new List<LevelData>();

            // Create 5 basic default levels
            for (int i = 1; i <= 5; i++)
            {
                allLevels.Add(new LevelData
                {
                    level = i,
                    trackCount = Mathf.Min(6 + i, 10),
                    wallSpeedStart = 0.01f + (i * 0.01f),
                    wallSpeedRamp = i * 0.0001f,
                    targetPoints = i * 100,
                    targetTime = 0,
                    obstacleProbability = Mathf.Min(i * 0.01f, 0.1f),
                    specialCubeChance = Mathf.Min(i * 0.01f, 0.05f),
                    spawnRate = Mathf.Max(2f - (i * 0.1f), 1f)
                });
            }

            levelsLoaded = true;
            Debug.LogWarning("Using default level configurations");
        }

        /// <summary>
        /// Load a specific level by index and apply its parameters.
        /// </summary>
        public void LoadLevel(int levelIndex)
        {
            if (!levelsLoaded || allLevels.Count == 0)
            {
                LoadLevelConfigurations();
            }

            // Clamp to valid range
            levelIndex = Mathf.Clamp(levelIndex, 1, allLevels.Count);
            currentLevelIndex = levelIndex;

            // Get level data (array is 0-indexed, levels are 1-indexed)
            currentLevel = allLevels[levelIndex - 1];

            ApplyLevelParameters();

            Debug.Log($"Loaded Level {currentLevel.level}: Tracks={currentLevel.trackCount}, WallSpeed={currentLevel.wallSpeedStart}, Target={currentLevel.targetPoints}");
        }

        /// <summary>
        /// Apply current level parameters to game systems.
        /// </summary>
        private void ApplyLevelParameters()
        {
            if (currentLevel == null) return;

            // Apply to spawner
            if (spawner != null)
            {
                spawner.SetTrackCount(currentLevel.trackCount);
                spawner.SetSpawnRate(currentLevel.spawnRate);
                spawner.SetSpecialCubeChance(currentLevel.specialCubeChance);
            }

            // Apply to wall controller
            if (wallController != null)
            {
                wallController.SetWallSpeed(currentLevel.wallSpeedStart, currentLevel.wallSpeedRamp);
            }

            Debug.Log($"Applied level {currentLevel.level} parameters to game systems");
        }

        /// <summary>
        /// Load the next level in sequence.
        /// </summary>
        public void LoadNextLevel()
        {
            int nextLevel = Mathf.Min(currentLevelIndex + 1, allLevels.Count);
            LoadLevel(nextLevel);
        }

        /// <summary>
        /// Check if the current level's completion conditions are met.
        /// </summary>
        public bool CheckLevelComplete(int currentScore, float gameTime)
        {
            if (currentLevel == null) return false;

            // Check score target
            bool scoreReached = currentLevel.targetPoints > 0 && currentScore >= currentLevel.targetPoints;

            // Check time target (0 means no time limit)
            bool timeReached = currentLevel.targetTime > 0 && gameTime >= currentLevel.targetTime;

            return scoreReached || timeReached;
        }

        /// <summary>
        /// Get obstacle probability for current level.
        /// </summary>
        public float GetObstacleProbability()
        {
            return currentLevel != null ? currentLevel.obstacleProbability : 0f;
        }

        // Getters
        public LevelData CurrentLevel => currentLevel;
        public int CurrentLevelIndex => currentLevelIndex;
        public int TotalLevels => allLevels.Count;
    }

    /// <summary>
    /// Data structure for a single level configuration.
    /// Maps directly to JSON structure.
    /// </summary>
    [Serializable]
    public class LevelData
    {
        public int level;
        public int trackCount = 10;
        public float wallSpeedStart = 0.02f;
        public float wallSpeedRamp = 0.0f;
        public int targetPoints = 100;
        public float targetTime = 0f; // 0 = no time limit, just score
        public float obstacleProbability = 0f;
        public float specialCubeChance = 0f;
        public float spawnRate = 2f; // seconds between spawns
    }

    /// <summary>
    /// Wrapper class for JSON deserialization of level array.
    /// </summary>
    [Serializable]
    public class LevelDataWrapper
    {
        public LevelData[] levels;
    }
}
