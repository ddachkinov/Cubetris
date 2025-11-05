using UnityEngine;
using System;

namespace Cubetris
{
    /// <summary>
    /// Central game manager - handles overall game state, lifecycle, and coordination between systems.
    /// Singleton pattern for easy access from any script.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Header("Game State")]
        [SerializeField] private GameState currentState = GameState.Menu;

        [Header("References")]
        [SerializeField] private LevelManager levelManager;
        [SerializeField] private UIManager uiManager;
        [SerializeField] private Spawner spawner;
        [SerializeField] private WallController wallController;
        [SerializeField] private MatchDetector matchDetector;

        [Header("Game Settings")]
        [SerializeField] private int lives = 3;
        [SerializeField] private int currentScore = 0;
        [SerializeField] private float gameTime = 0f;

        [Header("Debug")]
        [SerializeField] private bool showDebugInfo = true;
        [SerializeField] private bool instantWallMove = false;
        [SerializeField] private float spawnRateOverride = -1f; // -1 means use level default

        // Events
        public event Action<int> OnScoreChanged;
        public event Action<int> OnLivesChanged;
        public event Action<GameState> OnGameStateChanged;
        public event Action OnGameOver;
        public event Action OnLevelComplete;

        private void Awake()
        {
            // Singleton setup
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            // Auto-find references if not set
            if (levelManager == null) levelManager = FindObjectOfType<LevelManager>();
            if (uiManager == null) uiManager = FindObjectOfType<UIManager>();
            if (spawner == null) spawner = FindObjectOfType<Spawner>();
            if (wallController == null) wallController = FindObjectOfType<WallController>();
            if (matchDetector == null) matchDetector = FindObjectOfType<MatchDetector>();
        }

        private void Start()
        {
            InitializeGame();
        }

        private void Update()
        {
            if (currentState == GameState.Playing)
            {
                gameTime += Time.deltaTime;

                // Check win condition
                if (levelManager != null && levelManager.CheckLevelComplete(currentScore, gameTime))
                {
                    CompleteLevel();
                }
            }

            // Debug controls
            if (Input.GetKeyDown(KeyCode.R))
            {
                RestartLevel();
            }
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                TogglePause();
            }
        }

        private void InitializeGame()
        {
            currentScore = 0;
            gameTime = 0f;

            if (levelManager != null)
            {
                levelManager.LoadLevel(1);
            }

            ChangeState(GameState.Menu);
        }

        public void StartGame()
        {
            currentScore = 0;
            gameTime = 0f;
            lives = 3;

            ChangeState(GameState.Playing);

            if (spawner != null)
            {
                spawner.enabled = true;
                spawner.StartSpawning();
            }

            if (wallController != null)
            {
                wallController.enabled = true;
                wallController.StartPushing();
            }

            OnScoreChanged?.Invoke(currentScore);
            OnLivesChanged?.Invoke(lives);

            Debug.Log("Game Started!");
        }

        public void AddScore(int points)
        {
            currentScore += points;
            OnScoreChanged?.Invoke(currentScore);

            if (uiManager != null)
            {
                uiManager.UpdateScore(currentScore);
            }
        }

        public void LoseLife()
        {
            lives--;
            OnLivesChanged?.Invoke(lives);

            if (uiManager != null)
            {
                uiManager.UpdateLives(lives);
            }

            if (lives <= 0)
            {
                TriggerGameOver();
            }
        }

        public void TriggerGameOver()
        {
            ChangeState(GameState.GameOver);

            if (spawner != null)
            {
                spawner.StopSpawning();
            }

            if (wallController != null)
            {
                wallController.StopPushing();
            }

            OnGameOver?.Invoke();

            if (uiManager != null)
            {
                uiManager.ShowGameOver(currentScore);
            }

            Debug.Log($"Game Over! Final Score: {currentScore}");
        }

        public void CompleteLevel()
        {
            ChangeState(GameState.LevelComplete);

            if (spawner != null)
            {
                spawner.StopSpawning();
            }

            if (wallController != null)
            {
                wallController.StopPushing();
            }

            OnLevelComplete?.Invoke();

            if (uiManager != null)
            {
                uiManager.ShowLevelComplete(currentScore);
            }

            Debug.Log($"Level Complete! Score: {currentScore}");
        }

        public void LoadNextLevel()
        {
            if (levelManager != null)
            {
                levelManager.LoadNextLevel();
                RestartLevel();
            }
        }

        public void RestartLevel()
        {
            currentScore = 0;
            gameTime = 0f;

            // Clear all cubes and reset systems
            if (matchDetector != null)
            {
                matchDetector.ClearGrid();
            }

            if (spawner != null)
            {
                spawner.ResetSpawner();
            }

            if (wallController != null)
            {
                wallController.ResetWall();
            }

            StartGame();
        }

        public void TogglePause()
        {
            if (currentState == GameState.Playing)
            {
                ChangeState(GameState.Paused);
                Time.timeScale = 0f;

                if (uiManager != null)
                {
                    uiManager.ShowPauseMenu(true);
                }
            }
            else if (currentState == GameState.Paused)
            {
                ChangeState(GameState.Playing);
                Time.timeScale = 1f;

                if (uiManager != null)
                {
                    uiManager.ShowPauseMenu(false);
                }
            }
        }

        private void ChangeState(GameState newState)
        {
            if (currentState == newState) return;

            currentState = newState;
            OnGameStateChanged?.Invoke(newState);

            Debug.Log($"Game State Changed: {newState}");
        }

        // Getters for other systems
        public GameState CurrentState => currentState;
        public int CurrentScore => currentScore;
        public int CurrentLives => lives;
        public float GameTime => gameTime;
        public bool ShowDebugInfo => showDebugInfo;
        public bool InstantWallMove => instantWallMove;
        public float SpawnRateOverride => spawnRateOverride;
    }

    public enum GameState
    {
        Menu,
        Playing,
        Paused,
        LevelComplete,
        GameOver
    }
}
