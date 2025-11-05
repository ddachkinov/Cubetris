using UnityEngine;
using System.Collections.Generic;

namespace Cubetris
{
    /// <summary>
    /// Manages grid-based match detection using flood-fill algorithm.
    /// Detects clusters of 3 or more connected cubes of the same color.
    /// </summary>
    public class MatchDetector : MonoBehaviour
    {
        public static MatchDetector Instance { get; private set; }

        [Header("Grid Settings")]
        [SerializeField] private Vector3 gridOrigin = Vector3.zero;
        [SerializeField] private float cellSize = 1.0f;
        [SerializeField] private int minMatchSize = 3;

        [Header("Match Settings")]
        [SerializeField] private float matchCheckDelay = 0.3f;
        [SerializeField] private int basePointsPerCube = 10;
        [SerializeField] private float clusterSizeMultiplier = 1.5f;

        [Header("Debug")]
        [SerializeField] private bool showGridDebug = true;

        // Grid storage: maps grid position to cube controller
        private Dictionary<Vector2Int, CubeController> grid = new Dictionary<Vector2Int, CubeController>();

        // Temporary storage for flood-fill
        private HashSet<Vector2Int> visited = new HashSet<Vector2Int>();
        private List<CubeController> currentCluster = new List<CubeController>();

        private void Awake()
        {
            // Singleton setup
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        /// <summary>
        /// Register a cube at a specific grid position.
        /// </summary>
        public void RegisterCube(CubeController cube, Vector2Int gridPos)
        {
            if (cube == null) return;

            // Remove old entry if exists
            if (grid.ContainsKey(gridPos))
            {
                Debug.LogWarning($"Grid position {gridPos} already occupied, overwriting");
            }

            grid[gridPos] = cube;

            Debug.Log($"Registered cube at grid {gridPos} - Color: {cube.ColorType}");
        }

        /// <summary>
        /// Unregister a cube from a grid position.
        /// </summary>
        public void UnregisterCube(Vector2Int gridPos)
        {
            if (grid.ContainsKey(gridPos))
            {
                grid.Remove(gridPos);
                Debug.Log($"Unregistered cube at grid {gridPos}");
            }
        }

        /// <summary>
        /// Clear all cubes from the grid.
        /// </summary>
        public void ClearGrid()
        {
            // Clean up all registered cubes
            foreach (var cube in grid.Values)
            {
                if (cube != null && cube.gameObject != null)
                {
                    if (ObjectPool.Instance != null)
                    {
                        ObjectPool.Instance.ReturnCube(cube.gameObject);
                    }
                    else
                    {
                        Destroy(cube.gameObject);
                    }
                }
            }

            grid.Clear();
            Debug.Log("Grid cleared");
        }

        /// <summary>
        /// Check for matches at a specific grid position.
        /// </summary>
        public void CheckMatchesAt(Vector2Int gridPos)
        {
            if (!grid.ContainsKey(gridPos)) return;

            CubeController startCube = grid[gridPos];
            if (startCube == null) return;

            // Perform flood-fill to find cluster
            visited.Clear();
            currentCluster.Clear();

            FloodFill(gridPos, startCube.ColorType);

            // Check if cluster is large enough
            if (currentCluster.Count >= minMatchSize)
            {
                ProcessMatch(currentCluster);
            }
        }

        /// <summary>
        /// Flood-fill algorithm to find connected cubes of same color.
        /// </summary>
        private void FloodFill(Vector2Int position, CubeColorType targetColor)
        {
            // Check if already visited
            if (visited.Contains(position)) return;

            // Check if position has a cube
            if (!grid.ContainsKey(position)) return;

            CubeController cube = grid[position];
            if (cube == null) return;

            // Check if color matches
            if (cube.ColorType != targetColor) return;

            // Mark as visited and add to cluster
            visited.Add(position);
            currentCluster.Add(cube);

            // Recursively check neighbors (4-directional: left, right, up, down)
            FloodFill(position + Vector2Int.left, targetColor);
            FloodFill(position + Vector2Int.right, targetColor);
            FloodFill(position + Vector2Int.up, targetColor);
            FloodFill(position + Vector2Int.down, targetColor);

            // Optional: add diagonal neighbors for 8-directional matching
            // FloodFill(position + new Vector2Int(-1, 1), targetColor);
            // FloodFill(position + new Vector2Int(1, 1), targetColor);
            // FloodFill(position + new Vector2Int(-1, -1), targetColor);
            // FloodFill(position + new Vector2Int(1, -1), targetColor);
        }

        /// <summary>
        /// Process a matched cluster - explode cubes and award points.
        /// </summary>
        private void ProcessMatch(List<CubeController> cluster)
        {
            if (cluster == null || cluster.Count == 0) return;

            int clusterSize = cluster.Count;
            CubeColorType matchColor = cluster[0].ColorType;

            Debug.Log($"Match found! Color: {matchColor}, Size: {clusterSize}");

            // Calculate score
            int points = Mathf.RoundToInt(basePointsPerCube * clusterSize * Mathf.Pow(clusterSizeMultiplier, clusterSize - minMatchSize));

            // Award points
            if (GameManager.Instance != null)
            {
                GameManager.Instance.AddScore(points);
            }

            // Explode all cubes in cluster
            foreach (CubeController cube in cluster)
            {
                if (cube != null)
                {
                    cube.Explode();
                }
            }

            // Check for chain reactions after a delay
            Invoke(nameof(CheckChainReactions), matchCheckDelay);
        }

        /// <summary>
        /// Check for chain reactions after cubes have been removed.
        /// </summary>
        private void CheckChainReactions()
        {
            // Get all unique grid positions
            List<Vector2Int> positions = new List<Vector2Int>(grid.Keys);

            // Check each position for new matches
            foreach (Vector2Int pos in positions)
            {
                if (grid.ContainsKey(pos))
                {
                    CheckMatchesAt(pos);
                }
            }
        }

        /// <summary>
        /// Convert world position to grid position.
        /// </summary>
        public Vector2Int WorldToGrid(Vector3 worldPos)
        {
            Vector3 localPos = worldPos - gridOrigin;

            int x = Mathf.RoundToInt(localPos.x / cellSize);
            int y = Mathf.RoundToInt(localPos.y / cellSize);

            return new Vector2Int(x, y);
        }

        /// <summary>
        /// Convert grid position to world position.
        /// </summary>
        public Vector3 GridToWorld(Vector2Int gridPos)
        {
            float x = gridPos.x * cellSize;
            float y = gridPos.y * cellSize;

            return gridOrigin + new Vector3(x, y, 0);
        }

        /// <summary>
        /// Get cube at grid position.
        /// </summary>
        public CubeController GetCubeAt(Vector2Int gridPos)
        {
            return grid.ContainsKey(gridPos) ? grid[gridPos] : null;
        }

        /// <summary>
        /// Visualize grid in editor.
        /// </summary>
        private void OnDrawGizmos()
        {
            if (!showGridDebug || !GameManager.Instance?.ShowDebugInfo ?? true) return;

            // Draw grid origin
            Gizmos.color = Color.white;
            Gizmos.DrawWireSphere(gridOrigin, 0.2f);

            // Draw occupied cells
            if (grid != null && grid.Count > 0)
            {
                foreach (var kvp in grid)
                {
                    if (kvp.Value == null) continue;

                    Vector3 worldPos = GridToWorld(kvp.Key);
                    Gizmos.color = kvp.Value.CubeColor;
                    Gizmos.DrawWireCube(worldPos, Vector3.one * cellSize * 0.9f);
                }
            }
        }

        // Public getters
        public int GridCubeCount => grid.Count;
        public Dictionary<Vector2Int, CubeController> Grid => grid;
    }
}
