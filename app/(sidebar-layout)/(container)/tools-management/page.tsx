'use client';

import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { Copy, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { getFirstApiKey } from '@/app/actions/api-keys';
import { getMcpServers } from '@/app/actions/mcp-servers';
import { refreshSseTools } from '@/app/actions/refresh-sse-tools';
import { getToolsByMcpServerUuid, toggleToolStatus } from '@/app/actions/tools';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ToggleStatus } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';

export default function ToolsManagementPage() {
    const { currentProfile } = useProfiles();
    const { currentProject } = useProjects();
    const { toast } = useToast();
    const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

    const { data: mcpServers } = useSWR(
        currentProfile?.uuid ? ['getMcpServers', currentProfile.uuid] : null,
        () => getMcpServers(currentProfile?.uuid || '')
    );

    // Auto-expand all servers when data is loaded
    useEffect(() => {
        if (mcpServers) {
            setExpandedServers(new Set(mcpServers.map(server => server.uuid)));
        }
    }, [mcpServers]);

    const { data: apiKey } = useSWR(
        currentProject?.uuid ? `${currentProject?.uuid}/api-keys/getFirst` : null,
        () => getFirstApiKey(currentProject?.uuid || '')
    );

    const toggleServerExpansion = (serverUuid: string) => {
        const newExpanded = new Set(expandedServers);
        if (newExpanded.has(serverUuid)) {
            newExpanded.delete(serverUuid);
        } else {
            newExpanded.add(serverUuid);
        }
        setExpandedServers(newExpanded);
    };

    if (!mcpServers) return <div>Loading...</div>;

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Tools Management</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage all tools across your MCP servers
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                {mcpServers.map((server) => (
                    <Card key={server.uuid} className="shadow-none">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-xl">{server.name}</CardTitle>
                                    <CardDescription>{server.description || 'No description'}</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {server.type === 'SSE' ? (
                                        <Button
                                            size="sm"
                                            onClick={async () => {
                                                try {
                                                    await refreshSseTools(server.uuid);
                                                    toast({
                                                        description: "SSE tools refreshed successfully"
                                                    });
                                                } catch (error) {
                                                    console.error("Error refreshing SSE tools:", error);
                                                    toast({
                                                        variant: "destructive",
                                                        title: "Error refreshing tools",
                                                        description: error instanceof Error ? error.message : "An unknown error occurred"
                                                    });
                                                }
                                            }}>
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Refresh
                                        </Button>
                                    ) : (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button size="sm">
                                                    <RefreshCw className="mr-2 h-4 w-4" />
                                                    Refresh
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="w-full max-w-4xl">
                                                <DialogHeader>
                                                    <DialogTitle>Refresh Tools</DialogTitle>
                                                </DialogHeader>
                                                <div className="py-4">
                                                    <p className="mb-4">
                                                        Command-based MCP servers need to run locally. On next time you run MetaMCP MCP server, it will automatically refresh tools. To refresh tools manually for all installed MCP servers, run the following command:
                                                    </p>
                                                    <div className="relative">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="absolute top-2 right-2 z-10"
                                                            onClick={() => {
                                                                const command = `npx -y @metamcp/mcp-server-metamcp@latest --metamcp-api-key=${apiKey?.api_key ?? '<create an api key first>'} --report`;
                                                                navigator.clipboard.writeText(command);
                                                                toast({
                                                                    description: "Command copied to clipboard"
                                                                });
                                                            }}
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                        </Button>
                                                        <div className="overflow-x-auto max-w-full">
                                                            <pre className="bg-[#f6f8fa] text-[#24292f] p-4 rounded-md whitespace-pre-wrap break-words">
                                                                {`npx -y @metamcp/mcp-server-metamcp@latest --metamcp-api-key=${apiKey?.api_key ?? '<create an api key first>'} --report`}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                    <p className="mt-4 text-sm text-muted-foreground">
                                                        After running the command, your tools will be refreshed.
                                                    </p>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleServerExpansion(server.uuid)}>
                                        {expandedServers.has(server.uuid) ? 'Hide Tools' : 'Show Tools'}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        {expandedServers.has(server.uuid) && (
                            <CardContent>
                                <ToolsList mcpServerUuid={server.uuid} />
                            </CardContent>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}

function ToolsList({ mcpServerUuid }: { mcpServerUuid: string }) {
    const { data: tools, error, mutate } = useSWR(
        mcpServerUuid ? ['getToolsByMcpServerUuid', mcpServerUuid] : null,
        () => getToolsByMcpServerUuid(mcpServerUuid)
    );

    const columnHelper = createColumnHelper<any>();

    const columns = [
        columnHelper.accessor('name', {
            cell: (info) => info.getValue(),
            header: 'Name',
        }),
        columnHelper.accessor('description', {
            cell: (info) => info.getValue() || '-',
            header: 'Description',
        }),
        columnHelper.accessor('status', {
            cell: (info) => (
                <Switch
                    checked={info.getValue() === ToggleStatus.ACTIVE}
                    onCheckedChange={async (checked) => {
                        await toggleToolStatus(
                            info.row.original.uuid,
                            checked ? ToggleStatus.ACTIVE : ToggleStatus.INACTIVE
                        );
                        mutate();
                    }}
                />
            ),
            header: 'Status',
        }),
        columnHelper.accessor('created_at', {
            cell: (info) => new Date(info.getValue()).toLocaleString(),
            header: 'Reported At',
        }),
    ];

    const table = useReactTable({
        data: tools || [],
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    if (error) return <div>Failed to load tools</div>;
    if (!tools) return <div>Loading tools...</div>;
    if (tools.length === 0) return <div>No tools found for this MCP server.</div>;

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-300">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    className="py-2 px-4 border-b text-left font-semibold bg-gray-100"
                                >
                                    {flexRender(
                                        header.column.columnDef.header,
                                        header.getContext()
                                    )}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                            {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} className="py-2 px-4 border-b">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
} 