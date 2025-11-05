using UnityEngine;
using System.Collections;
using System.Collections.Generic;

namespace Cubetris
{
    /// <summary>
    /// Manages obstacle spawning based on level configuration and probability.
    /// Coordinates with Spawner to prevent blocking during critical moments.
    /// </summary>
    public class ObstacleManager : MonoBehaviour
    {
        [Header("Obstacle Settings")]
        [SerializeField] private GameObject obstaclePrefab;
        [SerializeField] private float spawnInterval = 10f;
        [SerializeField] private float obstacleDuration = 5f;
        [SerializeField] private Transform obstacleSpawnPoint;

        [Header("Spawn Probability")]
        [SerializeField] private float obstacleProbability = 0f;

        [Header("Enemy Settings")]
        [SerializeField] private GameObject enemyDronePrefab;
        [SerializeField] private float enemySpawnInterval = 20f;
        [SerializeField] private float enemyProbability = 0f;

        private List<ObstacleController> activeObstacles = new List<ObstacleController>();
        private bool isSpawning = false;
        private Coroutine spawnCoroutine;
        private LevelManager levelManager;

        private void Start()
        {
            levelManager = FindObjectOfType<LevelManager>();

            if (obstacleSpawnPoint == null)
            {
                GameObject spawnPoint = new GameObject("ObstacleSpawnPoint");
                spawnPoint.transform.parent = transform;
                spawnPoint.transform.position = new Vector3(0, 1, 5);
                obstacleSpawnPoint = spawnPoint.transform;
            }
        }

        /// <summary>
        /// Start spawning obstacles.
        /// </summary>
        public void StartSpawning()
        {
            isSpawning = true;

            // Get probability from level manager
            if (levelManager != null)
            {
                obstacleProbability = levelManager.GetObstacleProbability();
            }

            if (obstacleProbability > 0 && spawnCoroutine == null)
            {
                spawnCoroutine = StartCoroutine(SpawnRoutine());
            }
        }

        /// <summary>
        /// Stop spawning obstacles.
        /// </summary>
        public void StopSpawning()
        {
            isSpawning = false;

            if (spawnCoroutine != null)
            {
                StopCoroutine(spawnCoroutine);
                spawnCoroutine = null;
            }
        }

        /// <summary>
        /// Coroutine that spawns obstacles at intervals.
        /// </summary>
        private IEnumerator SpawnRoutine()
        {
            while (isSpawning)
            {
                yield return new WaitForSeconds(spawnInterval);

                // Check probability
                if (Random.value < obstacleProbability)
                {
                    SpawnObstacle();
                }

                // Check for enemy spawn
                if (Random.value < enemyProbability)
                {
                    SpawnEnemy();
                }
            }
        }

        /// <summary>
        /// Spawn an obstacle on a random track.
        /// </summary>
        private void SpawnObstacle()
        {
            if (obstaclePrefab == null)
            {
                Debug.LogWarning("Obstacle prefab not assigned!");
                return;
            }

            // Get random track (avoid current player track if possible)
            Spawner spawner = FindObjectOfType<Spawner>();
            int trackCount = spawner != null ? 10 : 10; // Default to 10 if spawner not found
            int randomTrack = Random.Range(0, trackCount);

            // Calculate position
            float trackSpacing = 1.0f;
            float xOffset = (trackCount - 1) * trackSpacing * 0.5f;
            float xPos = (randomTrack * trackSpacing) - xOffset;
            Vector3 spawnPos = new Vector3(xPos, 0.5f, obstacleSpawnPoint.position.z);

            // Instantiate obstacle
            GameObject obstacleObj = Instantiate(obstaclePrefab, spawnPos, Quaternion.identity);
            ObstacleController obstacle = obstacleObj.GetComponent<ObstacleController>();

            if (obstacle != null)
            {
                obstacle.Activate(randomTrack, spawnPos, obstacleDuration);
                activeObstacles.Add(obstacle);
            }

            Debug.Log($"Spawned obstacle on track {randomTrack}");
        }

        /// <summary>
        /// Spawn an enemy drone (placeholder implementation).
        /// </summary>
        private void SpawnEnemy()
        {
            if (enemyDronePrefab == null)
            {
                Debug.LogWarning("Enemy drone prefab not assigned!");
                return;
            }

            // Placeholder: spawn enemy at spawn point
            Vector3 spawnPos = obstacleSpawnPoint.position + Vector3.right * Random.Range(-5f, 5f);
            GameObject enemy = Instantiate(enemyDronePrefab, spawnPos, Quaternion.identity);

            // Add enemy controller if needed
            // EnemyController controller = enemy.GetComponent<EnemyController>();

            Debug.Log("Spawned enemy drone");
        }

        /// <summary>
        /// Clear all active obstacles.
        /// </summary>
        public void ClearAllObstacles()
        {
            foreach (ObstacleController obstacle in activeObstacles)
            {
                if (obstacle != null)
                {
                    obstacle.Deactivate();
                }
            }

            activeObstacles.Clear();
        }

        /// <summary>
        /// Check if a specific track is blocked by an obstacle.
        /// </summary>
        public bool IsTrackBlocked(int trackIndex)
        {
            foreach (ObstacleController obstacle in activeObstacles)
            {
                if (obstacle != null && obstacle.IsBlockingTrack(trackIndex))
                {
                    return true;
                }
            }

            return false;
        }

        // Public setters
        public void SetObstacleProbability(float probability)
        {
            obstacleProbability = Mathf.Clamp01(probability);
        }

        public void SetEnemyProbability(float probability)
        {
            enemyProbability = Mathf.Clamp01(probability);
        }
    }
}
